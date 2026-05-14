/**
 * Parser de faturas de cartão
 * Suporta CSV genérico, OFX simplificado e texto estruturado
 */

/**
 * Detecta o formato do arquivo e faz o parse
 */
function parseFatura(conteudo, nomeArquivo) {
  const ext = nomeArquivo.split('.').pop().toLowerCase();

  if (ext === 'ofx' || conteudo.includes('<OFX>') || conteudo.includes('<STMTTRN>')) {
    return parseOFX(conteudo);
  }

  if (ext === 'csv' || conteudo.includes(',')) {
    return parseCSV(conteudo);
  }

  // Tenta CSV por padrão
  return parseCSV(conteudo);
}

/**
 * Parse de CSV genérico
 * Detecta automaticamente colunas de data, descrição e valor
 */
function parseCSV(conteudo) {
  const linhas = conteudo
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (linhas.length < 2) throw new Error('Arquivo CSV inválido ou vazio');

  // Detecta separador (vírgula ou ponto-e-vírgula)
  const separador = linhas[0].includes(';') ? ';' : ',';

  const headers = linhas[0].split(separador).map(h =>
    h.replace(/["']/g, '').trim().toLowerCase()
  );

  // Mapeia colunas por nome aproximado
  const colMap = detectarColunas(headers);

  const transacoes = [];

  for (let i = 1; i < linhas.length; i++) {
    const cols = splitCSVLine(linhas[i], separador);
    if (cols.length < 2) continue;

    try {
      const transacao = extrairTransacao(cols, colMap, headers);
      if (transacao) transacoes.push(transacao);
    } catch (e) {
      console.warn(`Linha ${i + 1} ignorada: ${e.message}`);
    }
  }

  if (transacoes.length === 0) {
    throw new Error('Nenhuma transação encontrada no arquivo');
  }

  return transacoes;
}

function detectarColunas(headers) {
  const map = { data: -1, descricao: -1, valor: -1, estabelecimento: -1, tipo: -1, parcelas: -1 };

  headers.forEach((h, i) => {
    if (/data|date|dt/.test(h)) map.data = i;
    else if (/descri|desc|historico|lancamento|memo/.test(h)) map.descricao = i;
    else if (/valor|value|amount|montante|total/.test(h)) map.valor = i;
    else if (/estabelec|local|comercio|nome/.test(h)) map.estabelecimento = i;
    else if (/tipo|type|natureza/.test(h)) map.tipo = i;
    else if (/parcela|parc|install/.test(h)) map.parcelas = i;
  });

  // Fallback: posições comuns
  if (map.data === -1) map.data = 0;
  if (map.descricao === -1) map.descricao = 1;
  if (map.valor === -1) map.valor = 2;

  return map;
}

function extrairTransacao(cols, colMap, headers) {
  const get = (idx) => idx >= 0 && idx < cols.length
    ? cols[idx].replace(/["']/g, '').trim()
    : '';

  const dataStr = get(colMap.data);
  const descricao = get(colMap.descricao);
  const valorStr = get(colMap.valor);

  if (!descricao || !valorStr) return null;

  // Parse de data
  const data = parseData(dataStr);
  if (!data) return null;

  // Parse de valor
  let valor = parseValor(valorStr);
  if (isNaN(valor) || valor === 0) return null;

  // Tipo: positivo = débito, negativo = crédito/estorno
  const tipo = valor < 0 ? 'credito' : 'debito';
  valor = Math.abs(valor);

  // Parcelas
  let parcelaAtual = 1, parcelasTotal = 1;
  const parcelaStr = get(colMap.parcelas) || descricao;
  const parcelaMatch = parcelaStr.match(/(\d+)\/(\d+)/);
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

function parseData(str) {
  if (!str) return null;

  // Formatos: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, MM/DD/YYYY
  const formatos = [
    { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, fn: (m) => `${m[3]}-${m[2]}-${m[1]}` },
    { regex: /^(\d{4})-(\d{2})-(\d{2})$/, fn: (m) => `${m[1]}-${m[2]}-${m[3]}` },
    { regex: /^(\d{2})-(\d{2})-(\d{4})$/, fn: (m) => `${m[3]}-${m[2]}-${m[1]}` },
    { regex: /^(\d{2})\/(\d{2})\/(\d{2})$/, fn: (m) => `20${m[3]}-${m[2]}-${m[1]}` },
  ];

  for (const { regex, fn } of formatos) {
    const match = str.match(regex);
    if (match) {
      const iso = fn(match);
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }
  }

  return null;
}

function parseValor(str) {
  if (!str) return NaN;
  // Remove moeda, espaços; lida com 1.234,56 e 1,234.56
  let s = str.replace(/[R$\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // 1.234,56 → remover ponto, trocar vírgula
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
  // Remove parcelas, asteriscos e limpa o nome
  return descricao
    .replace(/\s+\d+\/\d+$/, '')
    .replace(/\s*\*\s*/g, ' ')
    .trim()
    .substring(0, 255);
}

function splitCSVLine(linha, sep) {
  const result = [];
  let campo = '';
  let dentroAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentroAspas = !dentroAspas;
    } else if (c === sep && !dentroAspas) {
      result.push(campo);
      campo = '';
    } else {
      campo += c;
    }
  }
  result.push(campo);
  return result;
}

/**
 * Parse simplificado de OFX
 */
function parseOFX(conteudo) {
  const transacoes = [];
  const blocos = conteudo.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g) || [];

  for (const bloco of blocos) {
    const get = (tag) => {
      const m = bloco.match(new RegExp(`<${tag}>([^<]+)`));
      return m ? m[1].trim() : '';
    };

    const dataStr = get('DTPOSTED');
    const valorStr = get('TRNAMT');
    const memo = get('MEMO') || get('NAME') || '';

    if (!dataStr || !valorStr) continue;

    // Data OFX: YYYYMMDD
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

/**
 * Categorização automática por palavras-chave
 */
const REGRAS_CATEGORIA = [
  { regex: /uber|99|taxi|cabify|metr[oô]|onibus|bus|posto|petrobras|shell|ipiranga|combust/i, cat: 'Transporte' },
  { regex: /ifood|rappi|delivery|pizza|burger|mcdonald|kfc|subway|sushi|restaur|lanchonete|padaria|cafe|starbucks|panera/i, cat: 'Restaurante' },
  { regex: /carrefour|extra|pao de acucar|walmart|atacadao|makro|assai|mercado|supermercado|hortifruti/i, cat: 'Supermercado' },
  { regex: /farmacia|drogaria|droga|medic|hospital|clinica|dentist|exame|lab |laborat/i, cat: 'Saúde' },
  { regex: /netflix|spotify|amazon prime|hbo|disney|youtube|globoplay|deezer|apple.*sub|google.*sub|assinatura/i, cat: 'Assinaturas' },
  { regex: /amazon|shopee|mercado livre|magalu|americanas|casas bahia|submarino|aliexpress/i, cat: 'Outros' },
  { regex: /zara|hm|h&m|renner|riachuelo|cea|c&a|forever 21|fashion|roupa|calcado|sapato/i, cat: 'Vestuário' },
  { regex: /hotel|airbnb|booking|passagem|latam|gol|azul|voo|viagem|turismo/i, cat: 'Viagem' },
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

module.exports = { parseFatura, categorizarAutomatico };
