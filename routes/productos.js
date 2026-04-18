const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware para verificar token
const verificarToken = require('../middleware/auth');

// GET - Listar productos del local
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM productos WHERE local_id = $1 AND activo = true ORDER BY nombre',
      [req.usuario.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Crear producto
router.post('/', verificarToken, async (req, res) => {
  const { nombre, categoria, precio, costo, stock, stock_min, cod_barras } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO productos (local_id, nombre, categoria, precio, costo, stock, stock_min, cod_barras) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.usuario.local_id, nombre, categoria, precio, costo, stock || 0, stock_min || 5, cod_barras]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Editar producto
router.put('/:id', verificarToken, async (req, res) => {
  const { nombre, categoria, precio, costo, stock, stock_min, cod_barras } = req.body;
  try {
    const result = await pool.query(
      'UPDATE productos SET nombre=$1, categoria=$2, precio=$3, costo=$4, stock=$5, stock_min=$6, cod_barras=$7 WHERE id=$8 AND local_id=$9 RETURNING *',
      [nombre, categoria, precio, costo, stock, stock_min, cod_barras, req.params.id, req.usuario.local_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Desactivar producto (no borrar)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE productos SET activo=false WHERE id=$1 AND local_id=$2',
      [req.params.id, req.usuario.local_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;