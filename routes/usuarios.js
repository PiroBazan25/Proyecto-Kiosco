const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const verificarToken = require('../middleware/auth');
const { enviarCredenciales } = require('../utils/email');

// GET - Listar usuarios del local
router.get('/', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const localId = req.usuario.rol === 'superadmin' 
      ? req.query.local_id 
      : req.usuario.local_id;
    const result = await pool.query(
      'SELECT id, nombre, email, rol, activo, created_at FROM usuarios WHERE local_id = $1 ORDER BY created_at DESC',
      [localId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Crear usuario
rrouter.post('/', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { nombre, email, pin, rol, local_id } = req.body;
  try {
    const pinHash = await bcrypt.hash(pin, 10);
    const localId = req.usuario.rol === 'superadmin' ? local_id : req.usuario.local_id;
    
    const result = await pool.query(
      'INSERT INTO usuarios (local_id, nombre, email, pin_hash, rol) VALUES ($1,$2,$3,$4,$5) RETURNING id, nombre, email, rol, activo',
      [localId, nombre, email, pinHash, rol]
    );

    const localResult = await pool.query('SELECT nombre FROM locales WHERE id = $1', [localId]);
    const localNombre = localResult.rows[0]?.nombre || 'KioscoManager';

    await enviarCredenciales({ nombre, email, pin, localNombre, rol });

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'El email ya está registrado' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// PUT - Editar usuario
router.put('/:id', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { nombre, email, pin, rol, activo } = req.body;
  try {
    let query, params;
    if (pin) {
      const pinHash = await bcrypt.hash(pin, 10);
      query = 'UPDATE usuarios SET nombre=$1, email=$2, pin_hash=$3, rol=$4, activo=$5 WHERE id=$6 RETURNING id, nombre, email, rol, activo';
      params = [nombre, email, pinHash, rol, activo, req.params.id];
    } else {
      query = 'UPDATE usuarios SET nombre=$1, email=$2, rol=$3, activo=$4 WHERE id=$5 RETURNING id, nombre, email, rol, activo';
      params = [nombre, email, rol, activo, req.params.id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;