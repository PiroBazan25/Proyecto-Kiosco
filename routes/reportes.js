const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// Reporte general
router.get('/dashboard', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const hoy = new Date().toISOString().split('T')[0];

    // Ventas de hoy
    const ventasHoy = await pool.query(
      `SELECT COUNT(*) as cantidad, 
        COALESCE(SUM(total), 0) as total,
        COALESCE(SUM(descuento), 0) as descuentos
       FROM ventas 
       WHERE local_id = $1 AND DATE(created_at) = $2`,
      [req.usuario.local_id, hoy]
    );

    // Ganancias de hoy (total - costo)
    const gananciasHoy = await pool.query(
      `SELECT COALESCE(SUM((vi.precio_unitario - p.costo) * vi.cantidad), 0) as ganancia
       FROM venta_items vi
       JOIN ventas v ON vi.venta_id = v.id
       JOIN productos p ON vi.producto_id = p.id
       WHERE v.local_id = $1 AND DATE(v.created_at) = $2`,
      [req.usuario.local_id, hoy]
    );

    // Ventas por dia (ultimos 7 dias)
    const ventasPorDia = await pool.query(
      `SELECT DATE(created_at) as fecha,
        COUNT(*) as cantidad,
        COALESCE(SUM(total), 0) as total
       FROM ventas
       WHERE local_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY fecha ASC`,
      [req.usuario.local_id]
    );

    // Productos mas vendidos
    const topProductos = await pool.query(
      `SELECT vi.nombre_producto, 
        SUM(vi.cantidad) as cantidad_vendida,
        SUM(vi.subtotal) as total_vendido,
        COALESCE(SUM((vi.precio_unitario - p.costo) * vi.cantidad), 0) as ganancia
       FROM venta_items vi
       JOIN ventas v ON vi.venta_id = v.id
       JOIN productos p ON vi.producto_id = p.id
       WHERE v.local_id = $1 AND v.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY vi.nombre_producto
       ORDER BY cantidad_vendida DESC
       LIMIT 5`,
      [req.usuario.local_id]
    );

    // Metodos de pago
    const metodosPago = await pool.query(
      `SELECT metodo_pago, COUNT(*) as cantidad, SUM(total) as total
       FROM ventas
       WHERE local_id = $1 AND DATE(created_at) = $2
       GROUP BY metodo_pago`,
      [req.usuario.local_id, hoy]
    );

    // Total del mes
    const totalMes = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total,
        COALESCE(SUM((vi.precio_unitario - p.costo) * vi.cantidad), 0) as ganancia
       FROM ventas v
       JOIN venta_items vi ON vi.venta_id = v.id
       JOIN productos p ON vi.producto_id = p.id
       WHERE v.local_id = $1 
       AND DATE_TRUNC('month', v.created_at) = DATE_TRUNC('month', NOW())`,
      [req.usuario.local_id]
    );

    res.json({
      hoy: {
        ventas: parseInt(ventasHoy.rows[0].cantidad),
        total: parseFloat(ventasHoy.rows[0].total),
        descuentos: parseFloat(ventasHoy.rows[0].descuentos),
        ganancia: parseFloat(gananciasHoy.rows[0].ganancia)
      },
      mes: {
        total: parseFloat(totalMes.rows[0].total),
        ganancia: parseFloat(totalMes.rows[0].ganancia)
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