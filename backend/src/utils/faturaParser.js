/**
 * Parser de faturas de cartão
 * Suporta CSV genérico, OFX simplificado, TXT estruturado e PDF
 * (texto extraível OU PDFs baseados em imagem via OCR com Tesseract)
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ── Entrada principal ────────────────────────────────────────────────────
async function parseFatura(conteudo, nomeArquivo) {
  const ext = nomeArquivo.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    return await parsePDF(conteudo); // conteudo deve ser um Buffer
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

// ── CSV ──────────────────────────────────────────────────────────────────
function parseCSV(conteudo) {
  const linhas = conteudo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (linhas.length < 2) throw new Error('Arquivo CSV inválido ou vazio');

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
      console.warn(`Linha ${i + 1} ignorada: ${e.message}`);
    }
  }

  if (transacoes.length === 0) throw new Error('Nenhuma transação encontrada no arquivo');
  return transacoes;
}

function detectarColunas(headers) {
  const map = { data: -1, descricao: -1, valor: -1, estabelecimento: -1, parcelas: -1 };

  headers.forEach((h, i) => {
    if (/data|date|dt/.test(h)) map.data = i;
    else if (/descri|desc|historico|lancamento|memo/.test(h)) map.descricao = i;
    else if (/valor|value|amount|montante|total/.test(h)) map.valor = i;
    else if (/estabelec|local|comercio|nome/.test(h)) map.estabelecimento = i;
    else if (/parcela|parc|install/.test(h)) map.parcelas = i;
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
  valor = Math.abs(valor);

  let parcelaAtual = 1, parcelasTotal = 1;
  const parcelaMatch = (get(colMap.parcelas) || descricao).match(/(\d+)\/(\d+)/);
  if (parcelaMatch) {
    parcelaAtual = parseInt(parcelaMatch[1]);
    parcelasTotal = parseInt(parcelaMatch[2]);
  }

  return {
    data,
    descricao: descricao.substring(0, 255),
    estabelecimento: inferirEstabelecimento(descricao),
    valor,
    tipo,
    parcela_atual: parcelaAtual,
    parcelas_total: parcelasTotal,
  };
}

function splitCSVLine(linha, sep) {
  const result = [];
  let campo = '';
  let dentroAspas = false;

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

// ── OFX ──────────────────────────────────────────────────────────────────
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
      ? `${dataStr.slice(0, 4)}-${dataStr.slice(4, 6)}-${dataStr.slice(6, 8)}` 
      : null;

    if (!data) continue;

    let valor = parseFloat(valorStr);
    const tipo = valor < 0 ? 'credito' : 'debito';
    valor = Math.abs(valor);

    transacoes.push({
      data,
      descricao: memo.substring(0, 255),
      estabelecimento: inferirEstabelecimento(memo),
      valor,
      tipo,
      parcela_atual: 1,
      parcelas_total: 1,
    });
  }

  if (transacoes.length === 0) throw new Error('Nenhuma transação encontrada no OFX');
  return transacoes;
}

// ── PDF ──────────────────────────────────────────────────────────────────
async function parsePDF(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch {
    throw new Error('Biblioteca pdf-parse não está instalada no servidor.');
  }

  let textoNativo = '';
  try {
    const data = await pdfParse(buffer);
    textoNativo = (data.text || '').trim();
  } catch (e) {
    console.warn(`pdf-parse falhou (${e.message}), tentando OCR...`);
  }

  const alfanumericos = (textoNativo.match(/[a-zA-Z0-9]/g) || []).length;

  if (alfanumericos >= 60) {
    return parsePDFText(textoNativo, { origem: 'texto' });
  }

  // Fallback: OCR
  const textoOCR = await extrairTextoViaOCR(buffer);
  const alfanumericosOCR = (textoOCR.match(/[a-zA-Z0-9]/g) || []).length;

  if (alfanumericosOCR < 30) {
    throw new Error(
      'Não foi possível extrair texto deste PDF, mesmo com OCR. ' +
      'Tente exportar a fatura em CSV ou OFX pelo app/site do seu banco.'
    );
  }

  return parsePDFText(textoOCR, { origem: 'ocr' });
}

async function extrairTextoViaOCR(buffer) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fatura-ocr-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const prefix = path.join(tmpDir, 'page');

  try {
    await fs.promises.writeFile(pdfPath, buffer);

    await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, prefix]);

    const arquivos = (await fs.promises.readdir(tmpDir))
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort();

    if (arquivos.length === 0) {
      throw new Error('Falha ao converter PDF em imagens para OCR.');
    }

    const MAX_PAGINAS = 8;
    const paginas = arquivos.slice(0, MAX_PAGINAS);

    let textoCompleto = '';
    for (const arquivo of paginas) {
      const imgPath = path.join(tmpDir, arquivo);
      const outBase = path.join(tmpDir, `ocr_${arquivo.replace('.png', '')}`);

      await execFileAsync('tesseract', [imgPath, outBase, '-l', 'por', '--psm', '6']);

      const txtPath = `${outBase}.txt`;
      const texto = await fs.promises.readFile(txtPath, 'utf-8');
      textoCompleto += texto + '\n';
    }

    return textoCompleto;
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { 
      maxBuffer: 1024 * 1024 * 50, 
      timeout: 60_000 
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} falhou: ${err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

function parsePDFText(texto, opts = {}) {
  const { origem = 'texto' } = opts;
  const linhasRaw = texto.split('\n').map(l => l.trim());
  const linhas = linhasRaw.filter(l => l.length > 0);
  const transacoes = [];

  const RE_DATA_COMPLETA = /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2,4})/;
  const RE_DATA_CURTA_INICIO = /^(\d{2})[\/\-\.](\d{2})(?![\/\-\.\d])/;
  const RE_DATA_INICIO = /^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2,4})/;

  const RE_VALOR = /-?\s*\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})\b/;
  const RE_VALOR_FIM = new RegExp(`(${RE_VALOR.source})\\s*$`);
  const RE_VALOR_ISOLADO = new RegExp(`^R?\\$?\\s*(${RE_VALOR.source})\\s*$`);
  const RE_RS_VALOR_GLOBAL = /R\$\s*(-?\s*\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2}))/g;

  const RE_IGNORAR = /^(total\s+para|total|subtotal|saldo\s+anterior|saldo|limite|vencimento|fechamento|pagamento\s+m[ií]nimo|encargos|iof|anuidade|p[aá]gina|situa[cç][aã]o\s+do\s+extrato|data\s*[:|]|hist[oó]rico|moeda\s+de|cota[cç][aã]o|aplicativo|^\|)/i;

  let anoReferencia = new Date().getFullYear();
  let mesReferenciaHint = null;

  for (const linha of linhas) {
    const m = linha.match(/data\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) {
      anoReferencia = parseInt(m[3]);
      mesReferenciaHint = parseInt(m[2]);
      break;
    }
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (RE_IGNORAR.test(linha)) continue;

    // Formato app (data sem ano)
    const dataCurtaMatch = linha.match(RE_DATA_CURTA_INICIO);
    if (dataCurtaMatch) {
      const valoresRS = [...linha.matchAll(RE_RS_VALOR_GLOBAL)];
      if (valoresRS.length > 0) {
        const ultimoValor = valoresRS[valoresRS.length - 1][1];
        const valor = parseValor(ultimoValor);
        if (!isNaN(valor) && valor !== 0) {
          const data = montarDataComAno(dataCurtaMatch, anoReferencia, mesReferenciaHint);
          if (data) {
            let descricao = linha
              .replace(RE_DATA_CURTA_INICIO, '')
              .replace(/\s*(USD|R\$).*$/i, '')
              .replace(/^[—\-–\s*]+/, '')
              .trim()
              .replace(/\s+/g, ' ');

            if (descricao.length >= 2) {
              transacoes.push(montarTransacao(data, descricao, valor));
              continue;
            }
          }
        }
      }
    }

    // Formato padrão
    const dataMatch = linha.match(RE_DATA_INICIO) || linha.match(RE_DATA_COMPLETA);
    if (!dataMatch) continue;

    const data = montarData(dataMatch);
    if (!data) continue;

    // Caso 1: tudo na mesma linha
    const valorMatch = linha.match(RE_VALOR_FIM);
    if (valorMatch) {
      const descricao = linha
        .replace(RE_DATA_COMPLETA, '')
        .replace(RE_VALOR_FIM, '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^[-–—\s]+|[-–—\s]+$/g, '');

      const valor = parseValor(valorMatch[1]);
      if (!isNaN(valor) && valor !== 0 && descricao.length >= 2) {
        transacoes.push(montarTransacao(data, descricao, valor));
        continue;
      }
    }

    // Caso 2: descrição e valor em linhas seguintes
    let descricao = linha
      .replace(RE_DATA_COMPLETA, '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[-–—\s]+|[-–—\s]+$/g, '');

    let consumidoAte = i;
    let valorEncontrado = null;

    for (let j = i + 1; j <= Math.min(i + 4, linhas.length - 1); j++) {
      const proxima = linhas[j];
      if (RE_DATA_INICIO.test(proxima) || RE_DATA_CURTA_INICIO.test(proxima)) break;

      const isolado = proxima.match(RE_VALOR_ISOLADO);
      if (isolado) {
        valorEncontrado = parseValor(isolado[1]);
        consumidoAte = j;
        break;
      }

      if (proxima.length >= 2 && !RE_IGNORAR.test(proxima)) {
        descricao = descricao ? `${descricao} ${proxima}` : proxima;
        consumidoAte = j;
      }
    }

    if (valorEncontrado !== null && !isNaN(valorEncontrado) && valorEncontrado !== 0 && descricao.length >= 2) {
      transacoes.push(montarTransacao(data, descricao, valorEncontrado));
      i = consumidoAte;
    }
  }

  if (transacoes.length === 0) {
    const sufixo = origem === 'ocr' ? ' O OCR não conseguiu identificar um padrão de transações reconhecível.' : '';
    throw new Error(`Não foi possível identificar transações no PDF.${sufixo} Tente exportar a fatura em CSV ou OFX.`);
  }

  return transacoes;
}

function montarData(match) {
  let [, d, m, a] = match;
  if (a.length === 2) a = '20' + a;
  const di = parseInt(d), mi = parseInt(m), ai = parseInt(a);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  const iso = `${ai}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isNaN(new Date(iso).getTime()) ? null : iso;
}

function montarDataComAno(match, anoReferencia, mesReferenciaHint) {
  const [, d, m] = match;
  const di = parseInt(d), mi = parseInt(m);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;

  let ano = anoReferencia;
  if (mesReferenciaHint !== null && mi > mesReferenciaHint) {
    ano -= 1;
  }

  const iso = `${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isNaN(new Date(iso).getTime()) ? null : iso;
}

function montarTransacao(data, descricaoRaw, valor) {
  const tipo = valor < 0 ? 'credito' : 'debito';
  const parcelaMatch = descricaoRaw.match(/(\d{1,2})\s*\/\s*(\d{1,2})\b/);

  return {
    data,
    descricao: descricaoRaw.substring(0, 255),
    estabelecimento: inferirEstabelecimento(descricaoRaw),
    valor: Math.abs(valor),
    tipo,
    parcela_atual: parcelaMatch ? parseInt(parcelaMatch[1]) : 1,
    parcelas_total: parcelaMatch ? parseInt(parcelaMatch[2]) : 1,
  };
}

// ── Utilitários compartilhados ──────────────────────────────────────────
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
  return parseFloat(s);
}

function inferirEstabelecimento(descricao) {
  return descricao
    .replace(/\s+\d+\/\d+$/, '')
    .replace(/\s*\*\s*/g, ' ')
    .trim()
    .substring(0, 255);
}

// ── Categorização automática ───────────────────────────────────────────
const REGRAS_CATEGORIA = [
  { regex: /uber|99\*?$|99\s|taxi|cabify|metr[oô]|onibus|bus|posto|petrobras|shell|ipiranga|combust/i, cat: 'Transporte' },
  { regex: /ifood|rappi|delivery|pizza|burger|mcdonald|kfc|subway|sushi|restaur|lanchonete|padaria|cafe|starbucks|panera/i, cat: 'Restaurante' },
  { regex: /carrefour|extra|pao de acucar|walmart|atacadao|makro|assai|mercado|supermercado|hortifruti/i, cat: 'Supermercado' },
  { regex: /farmacia|drogaria|droga|medic|hospital|clinica|dentist|exame|lab |laborat/i, cat: 'Saúde' },
  { regex: /netflix|spotify|amazon prime|hbo|disney|youtube|globoplay|deezer|apple.*sub|google.*sub|assinatura/i, cat: 'Assinaturas' },
  { regex: /amazon|shopee|mercado\s?livre|magalu|americanas|casas bahia|submarino|aliexpress/i, cat: 'Outros' },
  { regex: /zara|hm|h&m|renner|riachuelo|cea|c&a|forever 21|fashion|roupa|calcado|sapato/i, cat: 'Vestuário' },
  { regex: /hotel|airbnb|booking|passagem|latam|gol|azul|voo|viagem|turismo|bahamas/i, cat: 'Viagem' },
  { regex: /escola|faculdade|curso|udemy|alura|coursera|educacao|livraria|livro/i, cat: 'Educação' },
  { regex: /cinema|teatro|show|ingresso|parque|diversao|jogo|game|steam/i, cat: 'Lazer' },
  { regex: /aluguel|condomin|agua|luz|energia|gas|internet|tim|claro|vivo|oi |telecom/i, cat: 'Moradia' },
];

function categorizarAutomatico(descricao, categorias) {
  for (const { regex, cat } of REGRAS_CATEGORIA) {
    if (regex.test(descricao)) {
      const found = categorias.find(c => c.nome === cat);
      if (found) return found.id;
    }
  }
  const outros = categorias.find(c => c.nome === 'Outros');
  return outros ? outros.id : null;
}

module.exports = { 
  parseFatura, 
  categorizarAutomatico, 
  parsePDFText 
};