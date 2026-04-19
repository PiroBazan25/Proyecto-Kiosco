const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// GET - Listar compras
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
        json_agg(json_build_object(
          'nombre_producto', ci.nombre_producto,
          'cantidad', ci.cantidad,
          'precio_unitario', ci.precio_unitario,
          'subtotal', ci.subtotal
        )) as items
       FROM compras c
       LEFT JOIN compra_items ci ON ci.compra_id = c.id
       WHERE c.local_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.usuario.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Registrar compra y actualizar stock
router.post('/', verificarToken, async (req, res) => {
  const { proveedor_id, proveedor_nombre, items, notas } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const total = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);

    const compraResult = await client.query(
      'INSERT INTO compras (local_id, usuario_id, proveedor_id, proveedor_nombre, total, notas) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.usuario.local_id, req.usuario.id, proveedor_id, proveedor_nombre, total, notas]
    );

    const compra = compraResult.rows[0];

    for (const item of items) {
      await client.query(
        'INSERT INTO compra_items (compra_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES ($1,$2,$3,$4,$5,$6)',
        [compra.id, item.producto_id, item.nombre_producto, item.cantidad, item.precio_unitario, item.precio_unitario * item.cantidad]
      );

      await client.query(
        'UPDATE productos SET stock = stock + $1 WHERE id = $2 AND local_id = $3',
        [item.cantidad, item.producto_id, req.usuario.local_id]
      );
    }

    await client.query('COMMIT');
    res.json(compra);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET - Listar proveedores
router.get('/proveedores', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM proveedores WHERE local_id = $1 ORDER BY nombre',
      [req.usuario.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Crear proveedor
router.post('/proveedores', verificarToken, async (req, res) => {
  const { nombre, contacto, telefono, email } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO proveedores (local_id, nombre, contacto, telefono, email) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.usuario.local_id, nombre, contacto, telefono, email]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;