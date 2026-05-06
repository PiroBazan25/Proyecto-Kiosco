const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// GET - Listar clientes
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clientes WHERE local_id = $1 ORDER BY nombre',
      [req.usuario.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Crear cliente
router.post('/', verificarToken, async (req, res) => {
  const { nombre, telefono, email, notas } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO clientes (local_id, nombre, telefono, email, notas) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.usuario.local_id, nombre, telefono, email, notas]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Editar cliente
router.put('/:id', verificarToken, async (req, res) => {
  const { nombre, telefono, email, notas } = req.body;
  try {
    const result = await pool.query(
      'UPDATE clientes SET nombre=$1, telefono=$2, email=$3, notas=$4 WHERE id=$5 AND local_id=$6 RETURNING *',
      [nombre, telefono, email, notas, req.params.id, req.usuario.local_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Registrar fiado
router.post('/:id/fiado', verificarToken, async (req, res) => {
  const { monto, venta_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fiado = await client.query(
      'INSERT INTO fiado (local_id, cliente_id, venta_id, monto) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.usuario.local_id, req.params.id, venta_id, monto]
    );
    await client.query(
      'UPDATE clientes SET deuda = deuda + $1 WHERE id = $2',
      [monto, req.params.id]
    );
    await client.query('COMMIT');
    res.json(fiado.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST - Registrar pago de fiado
router.post('/:id/pagar', verificarToken, async (req, res) => {
  const { monto } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE clientes SET deuda = GREATEST(0, deuda - $1) WHERE id = $2 AND local_id = $3',
      [monto, req.params.id, req.usuario.local_id]
    );
    await client.query(
      `UPDATE fiado SET pagado = true, fecha_pago = NOW() 
       WHERE cliente_id = $1 AND pagado = false
       ORDER BY created_at
       LIMIT 1`,
      [req.params.id]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET - Historial de fiado del cliente
router.get('/:id/fiado', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM fiado WHERE cliente_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM fiado WHERE cliente_id = $1', [req.params.id]);
    await pool.query('DELETE FROM clientes WHERE id = $1 AND local_id = $2', 
      [req.params.id, req.usuario.local_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;