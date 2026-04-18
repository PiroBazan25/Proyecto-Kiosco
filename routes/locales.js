const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// GET - Listar todos los locales (solo superadmin)
router.get('/', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM locales ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Crear nuevo local
router.post('/', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { nombre, direccion, telefono, plan } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO locales (nombre, direccion, telefono, plan) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, direccion, telefono, plan || 'basico']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Activar/desactivar suscripción
router.put('/:id/suscripcion', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { activa, vence } = req.body;
  try {
    const result = await pool.query(
      'UPDATE locales SET suscripcion_activa=$1, suscripcion_vence=$2 WHERE id=$3 RETURNING *',
      [activa, vence, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;