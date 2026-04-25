const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// GET config del local (ANTES de /:id)
router.get('/config', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT config FROM locales WHERE id = $1',
      [req.usuario.local_id]
    );
    res.json(result.rows[0]?.config || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT config del local (ANTES de /:id)
router.put('/config', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const result = await pool.query(
      'UPDATE locales SET config = $1 WHERE id = $2 RETURNING config',
      [req.body, req.usuario.local_id]
    );
    res.json(result.rows[0].config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Listar todos los locales (solo superadmin)
router.get('/', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const result = await pool.query('SELECT * FROM locales ORDER BY created_at DESC');
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
  const { nombre, direccion, telefono, plan, vence, dueno } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const localResult = await client.query(
      'INSERT INTO locales (nombre, direccion, telefono, plan, suscripcion_vence) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [nombre, direccion, telefono, plan || 'basico', vence]
    );
    const local = localResult.rows[0];
    if (dueno) {
      const bcrypt = require('bcryptjs');
      const pinHash = await bcrypt.hash(dueno.pin, 10);
      await client.query(
        'INSERT INTO usuarios (local_id, nombre, email, pin_hash, rol) VALUES ($1,$2,$3,$4,$5)',
        [local.id, dueno.nombre, dueno.email, pinHash, 'admin_local']
      );
    }
    await client.query('COMMIT');
    res.json(local);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      res.status(400).json({ error: 'El email del dueño ya está registrado' });
    } else {
      res.status(500).json({ error: err.message });
    }
  } finally {
    client.release();
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

// PUT - Editar local
router.put('/:id', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { nombre, direccion, telefono, plan, vence } = req.body;
  try {
    const result = await pool.query(
      'UPDATE locales SET nombre=$1, direccion=$2, telefono=$3, plan=$4, suscripcion_vence=$5 WHERE id=$6 RETURNING *',
      [nombre, direccion, telefono, plan, vence, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET usuarios de un local especifico (solo superadmin)
router.get('/:id/usuarios', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, l.nombre as local_nombre
       FROM usuarios u
       LEFT JOIN locales l ON u.local_id = l.id
       WHERE u.local_id = $1
       ORDER BY u.rol, u.nombre`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;