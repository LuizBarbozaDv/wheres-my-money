const express = require('express');
const multer = require('multer');
const router = express.Router();

const faturasCtrl = require('../controllers/faturasController');
const transacoesCtrl = require('../controllers/transacoesController');
const categoriasCtrl = require('../controllers/categoriasController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 }, // 15MB — PDFs costumam ser maiores que CSVs
  fileFilter: (req, file, cb) => {
    const allowedExt = ['.csv', '.txt', '.ofx', '.pdf'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowedExt.includes(ext)) return cb(null, true);
    cb(new Error('Formato não suportado. Use CSV, TXT, OFX ou PDF'));
  },
});

// Faturas
router.get('/faturas', faturasCtrl.listarFaturas);
router.get('/faturas/:id', faturasCtrl.buscarFatura);
router.get('/faturas/:id/resumo', faturasCtrl.resumoFatura);
router.post('/faturas/upload', upload.single('arquivo'), faturasCtrl.uploadFatura);
router.delete('/faturas/:id', faturasCtrl.deletarFatura);

// Transações
router.get('/faturas/:faturaId/transacoes', transacoesCtrl.listarTransacoes);
router.patch('/transacoes/:id/categoria', transacoesCtrl.atualizarCategoria);
router.patch('/transacoes/bulk-categoria', transacoesCtrl.atualizarCategoriaEmLote);

// Categorias
router.get('/categorias', categoriasCtrl.listarCategorias);
router.post('/categorias', categoriasCtrl.criarCategoria);
router.patch('/categorias/:id', categoriasCtrl.atualizarCategoria);

// Health check
router.get('/health', async (req, res) => {
  const db = require('../models/db');
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

module.exports = router;
