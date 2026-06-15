/**
 * Parser de faturas de cartão – versão ultra‑robusta para Bradesco e outros
 * Suporta CSV, OFX, TXT e PDF (com ou sem OCR)
 */

const { execFile } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  API principal
// ─────────────────────────────────────────────────────────────────────────────
async function parseFatura(conteudo, nomeArquivo) {
  const ext = nomeArquivo.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    return await parsePDF(conteudo);
  }

  const texto = Buffer.isBuffer(conteudo) ? conteudo.toString('utf-8') : conteudo;

  if (ext === 'ofx' || texto.includes('<OFX>') || texto.includes('<STMTTRN>')) {
    return parseOFX(texto);
  }
  if (ext === 'csv' || texto.includes(',')) {
    return parseCSV(texto);
  }
  return parseCSV(texto);
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSV
// ─────────────────────────────────────────────────────────────────────────────
function parseCSV(conteudo) {
  const linhas = conteudo.split('\n').map(l => l.trim()).filter(l => l.length);
  if (linhas.length < 2) throw new Error('CSV vazio ou inválido');

  const separador = linhas[0].includes(';') ? ';' : ',';
  const headers = linhas[0].split(separador).map(h => h.replace(/["']/g, '').trim().toLowerCase());
  const colMap = detectarColunas(headers);
  const transacoes = [];

  for (let i = 1; i < linhas.length; i++) {
    const cols = splitCSVLine(linhas[i], separador);
    if (cols.length < 2) continue;
    try {
      const t = extrairTransacaoCSV(cols, colMap);
      if (t) transacoes.push(t);
    } catch (e) {
      // ignora linha
    }
  }
  if (!transacoes.length) throw new Error('Nenhuma transação encontrada no CSV');
  return transacoes;
}

function detectarColunas(headers) {
  const map = { data: -1, descricao: -1, valor: -1, estabelecimento: -1, parcelas: -1 };
  headers.forEach((h, i) => {
    if (/data|date|dt/.test(h)) map.data = i;
    else if (/descri|desc|historico|lancamento|memo/.test(h)) map.descricao = i;
    else if (/valor|value|amount|montante/.test(h)) map.valor = i;
    else if (/estabelec|local/.test(h)) map.estabelecimento = i;
    else if (/parcela|parc/.test(h)) map.parcelas = i;
  });
  if (map.data === -1) map.data = 0;
  if (map.descricao === -1) map.descricao = 1;
  if (map.valor === -1) map.valor = 2;
  return map;
}

function extrairTransacaoCSV(cols, colMap) {
  const get = idx => (idx >= 0 && idx < cols.length ? cols[idx].replace(/["']/g, '').trim() : '');
  const dataStr = get(colMap.data);
  const descricao = get(colMap.descricao);
  const valorStr = get(colMap.valor);
  if (!descricao || !valorStr) return null;

  const data = parseData(dataStr);
  if (!data) return null;
  let valor = parseValor(valorStr);
  if (isNaN(valor) || valor === 0) return null;

  const tipo = valor < 0 ? 'credito' : 'debito';
  const parcelaMatch = (get(colMap.parcelas) || descricao).match(/(\d+)\/(\d+)/);
  return {
    data,
    descricao: descricao.substring(0, 255),
    estabelecimento: inferirEstabelecimento(descricao),
    valor: Math.abs(valor),
    tipo,
    parcela_atual: parcelaMatch ? parseInt(parcelaMatch[1]) : 1,
    parcelas_total: parcelaMatch ? parseInt(parcelaMatch[2]) : 1,
  };
}

function splitCSVLine(linha, sep) {
  const result = [];
  let campo = '', dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') dentroAspas = !dentroAspas;
    else if (c === sep && !dentroAspas) {
      result.push(campo);
      campo = '';
    } else campo += c;
  }
  result.push(campo);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  OFX
// ─────────────────────────────────────────────────────────────────────────────
function parseOFX(conteudo) {
  const transacoes = [];
  const blocos = conteudo.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g) || [];
  for (const bloco of blocos) {
    const get = tag => {
      const m = bloco.match(new RegExp(`<${tag}>([^<]+)`));
      return m ? m[1].trim() : '';
    };
    const dataStr = get('DTPOSTED');
    const valorStr = get('TRNAMT');
    const memo = get('MEMO') || get('NAME') || '';
    if (!dataStr || !valorStr) continue;
    const data = dataStr.length >= 8
      ? `${dataStr.slice(0,4)}-${dataStr.slice(4,6)}-${dataStr.slice(6,8)}`
      : null;
    if (!data) continue;
    let valor = parseFloat(valorStr);
    const tipo = valor < 0 ? 'credito' : 'debito';
    transacoes.push({
      data,
      descricao: memo.substring(0, 255),
      estabelecimento: inferirEstabelecimento(memo),
      valor: Math.abs(valor),
      tipo,
      parcela_atual: 1,
      parcelas_total: 1,
    });
  }
  if (!transacoes.length) throw new Error('Nenhuma transação OFX encontrada');
  return transacoes;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF (texto extraído ou OCR)
// ─────────────────────────────────────────────────────────────────────────────
async function parsePDF(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch {
    throw new Error('Biblioteca pdf-parse não instalada. Execute: npm install pdf-parse');
  }

  let textoNativo = '';
  try {
    const data = await pdfParse(buffer);
    textoNativo = (data.text || '').trim();
  } catch (e) {
    console.warn(`pdf-parse falhou: ${e.message}, tentando OCR...`);
  }

  const temTexto = (textoNativo.match(/[a-zA-Z0-9]/g) || []).length >= 60;
  if (temTexto) {
    return parsePDFText(textoNativo, 'texto');
  }

  // OCR fallback
  const textoOCR = await extrairTextoViaOCR(buffer);
  const temOCR = (textoOCR.match(/[a-zA-Z0-9]/g) || []).length >= 30;
  if (!temOCR) {
    throw new Error('Não foi possível extrair texto do PDF, mesmo com OCR.');
  }
  return parsePDFText(textoOCR, 'ocr');
}

async function extrairTextoViaOCR(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fatura-ocr-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const prefix = path.join(tmpDir, 'page');

  try {
    await fs.writeFile(pdfPath, buffer);
    await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, prefix]);
    const arquivos = (await fs.readdir(tmpDir))
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort();
    if (!arquivos.length) throw new Error('Falha ao converter PDF para imagens');

    let textoCompleto = '';
    for (const arquivo of arquivos.slice(0, 8)) {
      const imgPath = path.join(tmpDir, arquivo);
      const outBase = path.join(tmpDir, `ocr_${arquivo.replace('.png', '')}`);
      await execFileAsync('tesseract', [imgPath, outBase, '-l', 'por', '--psm', '6']);
      const txtPath = `${outBase}.txt`;
      const texto = await fs.readFile(txtPath, 'utf-8');
      textoCompleto += texto + '\n';
    }
    return textoCompleto;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function execFileAsync(cmd, args) {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} falhou: ${err.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  NÚCLEO DA EXTRAÇÃO DE TEXTO PDF (VERSÃO DEFINITIVA COM BLOQUEIO TOTAL)
// ─────────────────────────────────────────────────────────────────────────────
function parsePDFText(texto, origem = 'texto') {
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length);
  const transacoes = [];

  // 1. Encontrar total da fatura
  let totalFatura = null;
  const totalMatch = texto.match(/Total\s+R?\$\s*([\d.,]+)/i);
  if (totalMatch) {
    totalFatura = parseValor(totalMatch[1]);
    console.log(`[INFO] Total da fatura: R$ ${totalFatura.toFixed(2)}`);
  }

  // 2. Palavras proibidas – ignora QUALQUER linha que contenha
  const IGNORAR_LINHA = /\b(encargos|iof|parcelamento|total\s+financiado|saldo\s+anterior|pagamento\s+m[ií]nimo|cet\s+do|valor\s+total\s+a\s+pagar|resumo\s+da\s+fatura|op[cçõ]es\s+de\s+pagamento|total\s+gasto|previs[ãa]o\s+de\s+fechamento|saldo\s+livelo|limite\s+dispon[ií]vel|fatura\s+anterior|saldo\s+de\s+pontos|livelo)\b/i;

  // 3. Regex data
  const RE_DATA = /(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/;

  function extrairValor(str) {
    const match = str.match(/R?\$\s*([\d.,]+)/i);
    if (match) return parseValor(match[1]);
    const final = str.match(/([\d.,]+)\s*$/);
    if (final) return parseValor(final[1]);
    return NaN;
  }

  // 4. Determinar ano de referência
  let anoRef = new Date().getFullYear();
  let mesRef = null;
  const dataCabecalho = texto.match(/data\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (dataCabecalho) {
    anoRef = parseInt(dataCabecalho[3]);
    mesRef = parseInt(dataCabecalho[2]);
  }

  // 5. Função auxiliar para verificar se uma linha é proibida
  function linhaProibida(linha) {
    return IGNORAR_LINHA.test(linha);
  }

  // 6. Percorrer linhas
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linhaProibida(linha)) continue;

    const dataMatch = linha.match(RE_DATA);
    if (!dataMatch) continue;

    let dia = parseInt(dataMatch[1]);
    let mes = parseInt(dataMatch[2]);
    let ano = dataMatch[3] ? parseInt(dataMatch[3]) : anoRef;
    if (ano < 100) ano = 2000 + ano;
    if (mesRef && mes > mesRef && ano === anoRef) ano -= 1;

    const dataISO = `${ano}-${mes.toString().padStart(2,'0')}-${dia.toString().padStart(2,'0')}`;
    if (isNaN(new Date(dataISO).getTime())) continue;

    let descricao = linha.replace(RE_DATA, '').trim();
    let valor = NaN;

    // Tenta valor na mesma linha
    let valInline = extrairValor(linha);
    if (!isNaN(valInline)) {
      valor = valInline;
      descricao = descricao.replace(/R?\$\s*[\d.,]+/i, '').trim();
    } else {
      // Procura nas próximas 2 linhas, PULANDO as proibidas
      for (let j = i+1; j <= Math.min(i+2, linhas.length-1); j++) {
        const prox = linhas[j];
        if (linhaProibida(prox)) continue; // 🔥 ignora linhas com palavras proibidas
        if (prox.match(RE_DATA)) break;
        const valProx = extrairValor(prox);
        if (!isNaN(valProx)) {
          valor = valProx;
          if (descricao.length === 0 && j === i+1) {
            descricao = prox.replace(/R?\$\s*[\d.,]+/i, '').trim();
          }
          break;
        } else if (descricao.length === 0 && prox.length > 2) {
          descricao = prox;
        }
      }
    }

    // Limpeza final
    descricao = descricao.replace(/^[—\-–*\s]+/, '').replace(/\s+/g, ' ').trim();
    // 🔥 descarta se descrição contiver palavra proibida
    if (descricao.length === 0 || linhaProibida(descricao) || isNaN(valor) || valor === 0) continue;

    let tipo = 'debito';
    if (valor < 0 || /PAGTO\.|PGTO|CRÉDITO/i.test(descricao)) {
      tipo = 'credito';
      valor = Math.abs(valor);
    }

    transacoes.push({
      data: dataISO,
      descricao: descricao.substring(0, 255),
      estabelecimento: inferirEstabelecimento(descricao),
      valor: Math.abs(valor),
      tipo,
      parcela_atual: 1,
      parcelas_total: 1,
    });
  }

  // 7. Validação da soma
  const somaDebitos = transacoes.filter(t => t.tipo === 'debito').reduce((s, t) => s + t.valor, 0);
  const somaCreditos = transacoes.filter(t => t.tipo === 'credito').reduce((s, t) => s + t.valor, 0);
  const saldoCalculado = somaDebitos - somaCreditos;

  if (totalFatura && Math.abs(saldoCalculado - totalFatura) > totalFatura * 0.05) {
    console.warn(`[AVISO] Soma das transações (R$ ${saldoCalculado.toFixed(2)}) difere do total da fatura (R$ ${totalFatura.toFixed(2)}).`);
    console.warn(`  Débitos: R$ ${somaDebitos.toFixed(2)} | Créditos: R$ ${somaCreditos.toFixed(2)}`);
    if (transacoes.length === 0 && totalFatura > 0) {
      transacoes.push({
        data: new Date().toISOString().slice(0,10),
        descricao: 'Total da fatura (extraído do resumo)',
        estabelecimento: 'Bradesco',
        valor: totalFatura,
        tipo: 'debito',
        parcela_atual: 1,
        parcelas_total: 1,
      });
    }
  }

  if (transacoes.length === 0) {
    throw new Error(`Nenhuma transação identificada no PDF (origem: ${origem}). Tente exportar a fatura em CSV/OFX.`);
  }

  return transacoes;
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITÁRIOS COMUNS
// ─────────────────────────────────────────────────────────────────────────────
function parseData(str) {
  if (!str) return null;
  const formatos = [
    { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, fn: m => `${m[3]}-${m[2]}-${m[1]}` },
    { regex: /^(\d{4})-(\d{2})-(\d{2})$/, fn: m => `${m[1]}-${m[2]}-${m[3]}` },
    { regex: /^(\d{2})-(\d{2})-(\d{4})$/, fn: m => `${m[3]}-${m[2]}-${m[1]}` },
    { regex: /^(\d{2})\/(\d{2})\/(\d{2})$/, fn: m => `20${m[3]}-${m[2]}-${m[1]}` },
  ];
  for (const { regex, fn } of formatos) {
    const match = str.match(regex);
    if (match) {
      const iso = fn(match);
      if (!isNaN(new Date(iso).getTime())) return iso;
    }
  }
  return null;
}

function parseValor(str) {
  if (!str) return NaN;
  let s = String(str).replace(/[R$\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const num = parseFloat(s);
  return isNaN(num) ? NaN : num;
}

function inferirEstabelecimento(descricao) {
  return descricao.replace(/\s+\d+\/\d+$/, '').replace(/\s*\*\s*/g, ' ').trim().substring(0, 255);
}

// ─────────────────────────────────────────────────────────────────────────────
//  CATEGORIZAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
const REGRAS_CATEGORIA = [
  { regex: /\b(?:uber|99|taxi|posto|combust)\b/i, cat: 'Transporte' },
  { regex: /ifood|ifd|restaur|lanchonete|pizza|sushi|hamb|padaria|cafe|starbucks/i, cat: 'Restaurante' },
  { regex: /carrefour|extra|mercado|supermercado|hortifruti/i, cat: 'Supermercado' },
  { regex: /farmacia|drogaria|medic|hospital|clinica/i, cat: 'Saúde' },
  { regex: /netflix|spotify|amazon prime|assinatura/i, cat: 'Assinaturas' },
  { regex: /amazon|shopee|mercado\s?livre|magalu/i, cat: 'Outros' },
  { regex: /hotel|airbnb|passagem|voo/i, cat: 'Viagem' },
  { regex: /escola|faculdade|curso|livraria/i, cat: 'Educação' },
  { regex: /cinema|teatro|ingresso|game|steam/i, cat: 'Lazer' },
  { regex: /aluguel|condomin|agua|luz|internet|tim|claro|vivo/i, cat: 'Moradia' },
];

function categorizarAutomatico(descricao, categorias) {
  for (const { regex, cat } of REGRAS_CATEGORIA) {
    if (regex.test(descricao)) {
      const encontrada = categorias.find(c => c.nome === cat);
      if (encontrada) return encontrada.id;
    }
  }
  const outros = categorias.find(c => c.nome === 'Outros');
  return outros ? outros.id : null;
}

module.exports = { parseFatura, categorizarAutomatico, parsePDFText };