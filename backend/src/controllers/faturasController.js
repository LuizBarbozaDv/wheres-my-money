const db = require('../models/db');
const { parseFatura, categorizarAutomatico } = require('../utils/faturaParser');
const { v4: uuidv4 } = require('uuid');

// GET /api/faturas
async function listarFaturas(req, res) {
  const result = await db.query(
    `SELECT f.*, 
      COUNT(t.id)::int AS total_transacoes,
      COALESCE(SUM(CASE WHEN t.tipo = 'debito' THEN t.valor ELSE 0 END), 0) AS total_gasto
     FROM faturas f
     LEFT JOIN transacoes t ON t.fatura_id = f.id
     GROUP BY f.id
     ORDER BY f.mes_referencia DESC, f.created_at DESC`
  );
  res.json(result.rows);
}

// GET /api/faturas/:id
async function buscarFatura(req, res) {
  const { id } = req.params;
  const fatura = await db.query('SELECT * FROM faturas WHERE id = $1', [id]);
  if (!fatura.rows[0]) return res.status(404).json({ error: 'Fatura não encontrada' });

  const transacoes = await db.query(
    `SELECT t.*, c.nome AS categoria_nome, c.icone AS categoria_icone, c.cor AS categoria_cor
     FROM transacoes t
     LEFT JOIN categorias c ON t.categoria_id = c.id
     WHERE t.fatura_id = $1
     ORDER BY t.data DESC`,
    [id]
  );

  res.json({ ...fatura.rows[0], transacoes: transacoes.rows });
}

// POST /api/faturas/upload
async function uploadFatura(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const conteudo = req.file.buffer.toString('utf-8');
  const nomeArquivo = req.file.originalname;

  // Parse do arquivo
  let transacoesRaw;
  try {
    transacoesRaw = parseFatura(conteudo, nomeArquivo);
  } catch (e) {
    return res.status(422).json({ error: `Erro ao processar arquivo: ${e.message}` });
  }

  // Detecta mês de referência pela maioria das transações
  const datas = transacoesRaw.map(t => t.data).sort();
  const mesRef = datas[Math.floor(datas.length / 2)]?.substring(0, 7) || new Date().toISOString().substring(0, 7);

  // Busca categorias para auto-categorização
  const cats = await db.query('SELECT * FROM categorias');
  const categorias = cats.rows;

  // Cria a fatura
  const nomeFatura = req.body.nome || `Fatura ${mesRef}`;
  const cartao = req.body.cartao || null;
  const vencimento = req.body.data_vencimento || null;

  const totalGasto = transacoesRaw
    .filter(t => t.tipo === 'debito')
    .reduce((s, t) => s + t.valor, 0);

  const fatura = await db.query(
    `INSERT INTO faturas (nome, mes_referencia, data_vencimento, valor_total, cartao)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nomeFatura, mesRef, vencimento, totalGasto, cartao]
  );
  const faturaId = fatura.rows[0].id;

  // Insere transações em batch
  const values = [];
  const params = [];
  let idx = 1;

  for (const t of transacoesRaw) {
    const catId = categorizarAutomatico(t.descricao, categorias);
    values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    params.push(
      faturaId, catId, t.descricao, t.estabelecimento,
      t.valor, t.data, t.parcela_atual, t.parcelas_total, t.tipo
    );
  }

  await db.query(
    `INSERT INTO transacoes 
       (fatura_id, categoria_id, descricao, estabelecimento, valor, data, parcela_atual, parcelas_total, tipo)
     VALUES ${values.join(', ')}`,
    params
  );

  res.status(201).json({
    fatura: fatura.rows[0],
    total_transacoes: transacoesRaw.length,
  });
}

// DELETE /api/faturas/:id
async function deletarFatura(req, res) {
  const { id } = req.params;
  await db.query('DELETE FROM faturas WHERE id = $1', [id]);
  res.json({ success: true });
}

// GET /api/faturas/:id/resumo
async function resumoFatura(req, res) {
  const { id } = req.params;

  const [porCategoria, porEstabelecimento, porDia, totais] = await Promise.all([
    db.query(
      `SELECT * FROM vw_resumo_categoria WHERE fatura_id = $1 ORDER BY total_gasto DESC`,
      [id]
    ),
    db.query(
      `SELECT * FROM vw_resumo_estabelecimento WHERE fatura_id = $1 LIMIT 20`,
      [id]
    ),
    db.query(
      `SELECT DATE_TRUNC('day', data)::date AS dia, SUM(valor) AS total
       FROM transacoes WHERE fatura_id = $1 AND tipo = 'debito'
       GROUP BY dia ORDER BY dia`,
      [id]
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total_transacoes,
         SUM(CASE WHEN tipo = 'debito' THEN valor ELSE 0 END) AS total_gasto,
         SUM(CASE WHEN tipo != 'debito' THEN valor ELSE 0 END) AS total_credito,
         AVG(CASE WHEN tipo = 'debito' THEN valor ELSE NULL END) AS ticket_medio,
         MAX(CASE WHEN tipo = 'debito' THEN valor ELSE NULL END) AS maior_gasto
       FROM transacoes WHERE fatura_id = $1`,
      [id]
    ),
  ]);

  res.json({
    totais: totais.rows[0],
    por_categoria: porCategoria.rows,
    por_estabelecimento: porEstabelecimento.rows,
    por_dia: porDia.rows,
  });
}

module.exports = { listarFaturas, buscarFatura, uploadFatura, deletarFatura, resumoFatura };
