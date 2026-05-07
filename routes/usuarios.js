const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const verificarToken = require('../middleware/auth');
const { enviarCredenciales } = require('../utils/email');

const ROLES_VALIDOS = ['cajero', 'admin_local', 'superadmin'];

function puedeGestionarRol(usuario, rol) {
  if (!ROLES_VALIDOS.includes(rol)) return false;
  if (usuario.rol === 'superadmin') return true;
  return rol === 'cajero';
}

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
router.post('/', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { nombre, email, pin, rol, local_id } = req.body;
  if (!nombre || !email || !pin || !rol) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (!puedeGestionarRol(req.usuario, rol)) {
    return res.status(403).json({ error: 'No podés asignar ese rol' });
  }
  try {
    const pinHash = await bcrypt.hash(pin, 10);
    const localId = req.usuario.rol === 'superadmin' ? local_id : req.usuario.local_id;
    if (!localId) {
      return res.status(400).json({ error: 'Local requerido' });
    }
    
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
  if (!nombre || !email || !rol) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (!puedeGestionarRol(req.usuario, rol)) {
    return res.status(403).json({ error: 'No podés asignar ese rol' });
  }
  try {
    const usuarioActual = await pool.query(
      'SELECT id, rol, local_id FROM usuarios WHERE id = $1',
      [req.params.id]
    );
    if (usuarioActual.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (
      req.usuario.rol === 'admin_local' &&
      (usuarioActual.rows[0].local_id !== req.usuario.local_id || usuarioActual.rows[0].rol !== 'cajero')
    ) {
      return res.status(403).json({ error: 'Solo podés editar cajeros de tu local' });
    }

    let query, params;
    if (pin) {
      const pinHash = await bcrypt.hash(pin, 10);
      query = 'UPDATE usuarios SET nombre=$1, email=$2, pin_hash=$3, rol=$4, activo=$5 WHERE id=$6 AND local_id=$7 RETURNING id, nombre, email, rol, activo';
      params = [nombre, email, pinHash, rol, activo, req.params.id, usuarioActual.rows[0].local_id];
    } else {
      query = 'UPDATE usuarios SET nombre=$1, email=$2, rol=$3, activo=$4 WHERE id=$5 AND local_id=$6 RETURNING id, nombre, email, rol, activo';
      params = [nombre, email, rol, activo, req.params.id, usuarioActual.rows[0].local_id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Borrar usuario
router.delete('/:id', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    // El dueño solo puede borrar cajeros de su local
    if (req.usuario.rol === 'admin_local') {
      const usuario = await pool.query(
        'SELECT * FROM usuarios WHERE id = $1 AND local_id = $2',
        [req.params.id, req.usuario.local_id]
      );
      if (usuario.rows.length === 0) {
        return res.status(403).json({ error: 'Sin permiso' });
      }
      if (usuario.rows[0].rol !== 'cajero') {
        return res.status(403).json({ error: 'Solo podés borrar cajeros' });
      }
    }
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
