const db = require('../models/db');

// GET /api/faturas/:faturaId/transacoes
async function listarTransacoes(req, res) {
  const { faturaId } = req.params;
  const { categoria, tipo, busca, order = 'data', dir = 'desc', page = 1, limit = 50 } = req.query;

  const conditions = ['t.fatura_id = $1'];
  const params = [faturaId];
  let i = 2;

  if (categoria) { conditions.push(`t.categoria_id = $${i++}`); params.push(categoria); }
  if (tipo) { conditions.push(`t.tipo = $${i++}`); params.push(tipo); }
  if (busca) {
    conditions.push(`(t.descricao ILIKE $${i} OR t.estabelecimento ILIKE $${i})`);
    params.push(`%${busca}%`); i++;
  }

  const where = conditions.join(' AND ');
  const orderCol = ['data', 'valor', 'descricao'].includes(order) ? order : 'data';
  const orderDir = dir === 'asc' ? 'ASC' : 'DESC';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [rows, count] = await Promise.all([
    db.query(
      `SELECT t.*, c.nome AS categoria_nome, c.icone AS categoria_icone, c.cor AS categoria_cor
       FROM transacoes t
       LEFT JOIN categorias c ON t.categoria_id = c.id
       WHERE ${where}
       ORDER BY t.${orderCol} ${orderDir}
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    ),
    db.query(`SELECT COUNT(*)::int FROM transacoes t WHERE ${where}`, params),
  ]);

  res.json({
    data: rows.rows,
    total: count.rows[0].count,
    page: parseInt(page),
    limit: parseInt(limit),
  });
}

// PATCH /api/transacoes/:id/categoria
async function atualizarCategoria(req, res) {
  const { id } = req.params;
  const { categoria_id } = req.body;

  const result = await db.query(
    `UPDATE transacoes SET categoria_id = $1 WHERE id = $2 RETURNING *`,
    [categoria_id, id]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json(result.rows[0]);
}

// PATCH /api/transacoes/bulk-categoria
async function atualizarCategoriaEmLote(req, res) {
  const { ids, categoria_id } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'IDs obrigatórios' });

  const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
  await db.query(
    `UPDATE transacoes SET categoria_id = $1 WHERE id IN (${placeholders})`,
    [categoria_id, ...ids]
  );
  res.json({ updated: ids.length });
}

module.exports = { listarTransacoes, atualizarCategoria, atualizarCategoriaEmLote };
