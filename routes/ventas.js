const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// POST - Registrar venta
router.post('/', verificarToken, async (req, res) => {
  const { items, subtotal, descuento, total, metodo_pago, cuotas } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Crear la venta
    const ventaResult = await client.query(
      'INSERT INTO ventas (local_id, usuario_id, subtotal, descuento, total, metodo_pago, cuotas) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.usuario.local_id, req.usuario.id, subtotal, descuento || 0, total, metodo_pago, cuotas || 1]
    );

    const venta = ventaResult.rows[0];

    // Insertar items y descontar stock
    for (const item of items) {
      await client.query(
        'INSERT INTO venta_items (venta_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal) VALUES ($1,$2,$3,$4,$5,$6)',
        [venta.id, item.id, item.nombre, item.precio, item.cantidad, item.precio * item.cantidad]
      );

      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id = $2 AND local_id = $3',
        [item.cantidad, item.id, req.usuario.local_id]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, venta });

  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET - Historial de ventas
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, u.nombre as cajero,
       json_agg(json_build_object(
         'nombre', vi.nombre_producto,
         'cantidad', vi.cantidad,
         'precio', vi.precio_unitario,
         'subtotal', vi.subtotal
       )) as items
       FROM ventas v
       LEFT JOIN usuarios u ON v.usuario_id = u.id
       LEFT JOIN venta_items vi ON v.id = vi.venta_id
       WHERE v.local_id = $1
       GROUP BY v.id, u.nombre
       ORDER BY v.created_at DESC`,
      [req.usuario.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;