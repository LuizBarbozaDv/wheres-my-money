const db = require('../models/db');

async function listarCategorias(req, res) {
  const result = await db.query('SELECT * FROM categorias ORDER BY nome');
  res.json(result.rows);
}

async function criarCategoria(req, res) {
  const { nome, icone, cor } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

  const result = await db.query(
    'INSERT INTO categorias (nome, icone, cor) VALUES ($1, $2, $3) RETURNING *',
    [nome, icone || '💳', cor || '#6366f1']
  );
  res.status(201).json(result.rows[0]);
}

async function atualizarCategoria(req, res) {
  const { id } = req.params;
  const { nome, icone, cor } = req.body;

  const result = await db.query(
    'UPDATE categorias SET nome = COALESCE($1, nome), icone = COALESCE($2, icone), cor = COALESCE($3, cor) WHERE id = $4 RETURNING *',
    [nome, icone, cor, id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Categoria não encontrada' });
  res.json(result.rows[0]);
}

module.exports = { listarCategorias, criarCategoria, atualizarCategoria };
