const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// POST - Registrar venta
router.post('/', verificarToken, async (req, res) => {
  const { items, descuento, metodo_pago, cuotas } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agregá productos a la venta' });
  }
  const descuentoNumero = Number(descuento || 0);
  if (!Number.isFinite(descuentoNumero) || descuentoNumero < 0) {
    return res.status(400).json({ error: 'Descuento inválido' });
  }
  const cuotasNumero = Number(cuotas || 1);
  if (!Number.isInteger(cuotasNumero) || cuotasNumero < 1) {
    return res.status(400).json({ error: 'Cuotas inválidas' });
  }
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Crear la venta
    const turnoActivo = await client.query(
      'SELECT id FROM turnos WHERE usuario_id = $1 AND local_id = $2 AND estado = $3',
      [req.usuario.id, req.usuario.local_id, 'abierto']
    );
    const turnoId = turnoActivo.rows[0]?.id || null;

    const itemsVenta = [];
    let subtotalCalculado = 0;

    for (const item of items) {
      const productoId = item.id || item.producto_id;
      const cantidad = Number(item.cantidad);
      if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Item inválido' });
      }

      const productoResult = await client.query(
        'SELECT id, nombre, precio, stock, COALESCE(unidad_medida, $3) as unidad_medida FROM productos WHERE id = $1 AND local_id = $2 AND activo = true FOR UPDATE',
        [productoId, req.usuario.local_id, 'unidad']
      );
      const producto = productoResult.rows[0];
      if (!producto) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      if (Number(producto.stock) < cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}` });
      }

      const precio = Number(producto.precio);
      const subtotalItem = precio * cantidad;
      subtotalCalculado += subtotalItem;
      itemsVenta.push({
        id: producto.id,
        nombre: producto.nombre,
        precio,
        cantidad,
        unidad_medida: producto.unidad_medida || 'unidad',
        subtotal: subtotalItem
      });
    }

    if (descuentoNumero > subtotalCalculado) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El descuento no puede superar el subtotal' });
    }

    const totalCalculado = subtotalCalculado - descuentoNumero;

    const ventaResult = await client.query(
      'INSERT INTO ventas (local_id, usuario_id, subtotal, descuento, total, metodo_pago, cuotas, turno_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.usuario.local_id, req.usuario.id, subtotalCalculado, descuentoNumero, totalCalculado, metodo_pago, cuotasNumero, turnoId]
    );

    const venta = ventaResult.rows[0];

    // Insertar items y descontar stock
    for (const item of itemsVenta) {
      await client.query(
        'INSERT INTO venta_items (venta_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, unidad_medida) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [venta.id, item.id, item.nombre, item.precio, item.cantidad, item.subtotal, item.unidad_medida]
      );

      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id = $2 AND local_id = $3 AND stock >= $1',
        [item.cantidad, item.id, req.usuario.local_id]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, venta: { ...venta, items: itemsVenta } });

  } catch (err) {
    console.error('Error registrando venta:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET - Historial de ventas agrupado por dia
router.get('/', verificarToken, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    let query = `
      SELECT v.*, u.nombre as cajero,
        json_agg(json_build_object(
          'nombre', vi.nombre_producto,
          'cantidad', vi.cantidad,
          'unidad_medida', COALESCE(vi.unidad_medida, 'unidad'),
          'precio', vi.precio_unitario,
          'subtotal', vi.subtotal
        ) ORDER BY vi.id) as items
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      LEFT JOIN venta_items vi ON v.id = vi.venta_id
      WHERE v.local_id = $1
    `;
    const params = [req.usuario.local_id];

    if (desde) {
      params.push(desde);
      query += ` AND DATE(v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') >= $${params.length}`;
    }
    if (hasta) {
      params.push(hasta);
      query += ` AND DATE(v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') <= $${params.length}`;
    }

    query += ` GROUP BY v.id, u.nombre ORDER BY v.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error cargando ventas:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Borrar ventas de un dia
router.delete('/dia/:fecha', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ventas = await client.query(
      `SELECT id FROM ventas
       WHERE local_id = $1
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2`,
      [req.usuario.local_id, req.params.fecha]
    );
    const ids = ventas.rows.map(v => v.id);
    if (ids.length > 0) {
      await client.query(
        `DELETE FROM venta_items WHERE venta_id = ANY($1)`,
        [ids]
      );
      await client.query(
        `DELETE FROM ventas
         WHERE local_id = $1
         AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2`,
        [req.usuario.local_id, req.params.fecha]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, eliminadas: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE - Reset completo de ventas del local
router.delete('/reset', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM venta_items WHERE venta_id IN (SELECT id FROM ventas WHERE local_id = $1)', [req.usuario.local_id]);
    await client.query('DELETE FROM ventas WHERE local_id = $1', [req.usuario.local_id]);
    await client.query('DELETE FROM turnos WHERE local_id = $1', [req.usuario.local_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
router.delete('/reset-periodo', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { desde, hasta } = req.query;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ventas = await client.query(
      `SELECT id FROM ventas WHERE local_id = $1 
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3`,
      [req.usuario.local_id, desde, hasta]
    );
    const ids = ventas.rows.map(v => v.id);
    if (ids.length > 0) {
      await client.query('DELETE FROM venta_items WHERE venta_id = ANY($1)', [ids]);
      await client.query('DELETE FROM ventas WHERE id = ANY($1)', [ids]);
    }
    await client.query('COMMIT');
    res.json({ ok: true, eliminadas: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
