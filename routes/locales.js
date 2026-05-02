const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');
const { enviarCredenciales } = require('../utils/email');

// --- RUTAS ESPECÍFICAS (SIEMPRE ARRIBA) ---

// GET config del local
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

// PUT config del local
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

// ✅ NUEVA RUTA MP-TOKEN (Ubicación correcta)
router.put('/mp-token', verificarToken, async (req, res) => {
  // Nota: Permitimos admin_local y superadmin por seguridad
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    await pool.query(
      'UPDATE locales SET mp_access_token = $1 WHERE id = $2',
      [req.body.token, req.usuario.local_id]
    );
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTAS GENERALES ---

// GET - Listar todos los locales
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
      await enviarCredenciales({ 
        nombre: dueno.nombre, 
        email: dueno.email, 
        pin: dueno.pin, 
        localNombre: local.nombre, 
        rol: 'admin_local' 
      });
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

// --- RUTAS CON PARÁMETROS DINÁMICOS (AL FINAL) ---

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

// DELETE - Borrar local completo
router.delete('/:id', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const localId = req.params.id;
    
    await client.query('DELETE FROM venta_items WHERE venta_id IN (SELECT id FROM ventas WHERE local_id = $1)', [localId]);
    await client.query('DELETE FROM ventas WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM compra_items WHERE compra_id IN (SELECT id FROM compras WHERE local_id = $1)', [localId]);
    await client.query('DELETE FROM compras WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM fiado WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM clientes WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM turnos WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM productos WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM proveedores WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM usuarios WHERE local_id = $1', [localId]);
    await client.query('DELETE FROM locales WHERE id = $1', [localId]);
    
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;