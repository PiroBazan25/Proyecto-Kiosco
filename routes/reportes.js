const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

router.get('/dashboard', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const { desde, hasta } = req.query;
    const hoy = new Date().toISOString().split('T')[0];
    const fechaDesde = desde || hoy;
    const fechaHasta = hasta || hoy;

    const ventas = await pool.query(
      `SELECT COUNT(*) as cantidad, 
        COALESCE(SUM(total), 0) as total,
        COALESCE(SUM(descuento), 0) as descuentos
       FROM ventas 
       WHERE local_id = $1 
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3`,
      [req.usuario.local_id, fechaDesde, fechaHasta]
    );

    const ganancias = await pool.query(
      `SELECT COALESCE(SUM((vi.precio_unitario - p.costo) * vi.cantidad), 0) as ganancia
       FROM venta_items vi
       JOIN ventas v ON vi.venta_id = v.id
       JOIN productos p ON vi.producto_id = p.id
       WHERE v.local_id = $1
       AND DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3`,
      [req.usuario.local_id, fechaDesde, fechaHasta]
    );

    const ventasPorDia = await pool.query(
      `SELECT DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha,
        COUNT(*) as cantidad,
        COALESCE(SUM(total), 0) as total
       FROM ventas
       WHERE local_id = $1
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
       GROUP BY DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')
       ORDER BY fecha ASC`,
      [req.usuario.local_id, fechaDesde, fechaHasta]
    );

    const topProductos = await pool.query(
      `SELECT vi.nombre_producto, 
        SUM(vi.cantidad) as cantidad_vendida,
        SUM(vi.subtotal) as total_vendido,
        COALESCE(SUM((vi.precio_unitario - p.costo) * vi.cantidad), 0) as ganancia
       FROM venta_items vi
       JOIN ventas v ON vi.venta_id = v.id
       JOIN productos p ON vi.producto_id = p.id
       WHERE v.local_id = $1
       AND DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
       GROUP BY vi.nombre_producto
       ORDER BY cantidad_vendida DESC
       LIMIT 5`,
      [req.usuario.local_id, fechaDesde, fechaHasta]
    );

    const metodosPago = await pool.query(
      `SELECT metodo_pago, COUNT(*) as cantidad, SUM(total) as total
       FROM ventas
       WHERE local_id = $1
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
       GROUP BY metodo_pago`,
      [req.usuario.local_id, fechaDesde, fechaHasta]
    );

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      resumen: {
        ventas: parseInt(ventas.rows[0].cantidad),
        total: parseFloat(ventas.rows[0].total),
        descuentos: parseFloat(ventas.rows[0].descuentos),
        ganancia: parseFloat(ganancias.rows[0].ganancia)
      },
      ventasPorDia: ventasPorDia.rows,
      topProductos: topProductos.rows,
      metodosPago: metodosPago.rows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;