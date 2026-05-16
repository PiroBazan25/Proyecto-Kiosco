const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

router.get('/superadmin', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const { desde, hasta } = req.query;
    const hoy = new Date().toISOString().split('T')[0];
    const fechaDesde = desde || hoy;
    const fechaHasta = hasta || hoy;

    const resumen = await pool.query(
      `SELECT
        l.id,
        l.nombre,
        l.plan,
        l.suscripcion_activa,
        l.suscripcion_vence,
        COUNT(v.id) as ventas,
        COALESCE(SUM(v.total), 0) as facturado,
        COALESCE(AVG(v.total), 0) as ticket_promedio,
        MAX(v.created_at) as ultima_venta
       FROM locales l
       LEFT JOIN ventas v ON v.local_id = l.id
        AND DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $1 AND $2
       GROUP BY l.id
       ORDER BY facturado DESC, ventas DESC, l.nombre ASC`,
      [fechaDesde, fechaHasta]
    );

    const porDia = await pool.query(
      `SELECT
        l.id as local_id,
        l.nombre as local_nombre,
        DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha,
        COUNT(v.id) as ventas,
        COALESCE(SUM(v.total), 0) as facturado
       FROM locales l
       JOIN ventas v ON v.local_id = l.id
       WHERE DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $1 AND $2
       GROUP BY l.id, l.nombre, DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')
       ORDER BY fecha ASC, facturado DESC`,
      [fechaDesde, fechaHasta]
    );

    const totales = resumen.rows.reduce((acc, local) => {
      acc.locales += 1;
      if (local.suscripcion_activa) acc.activos += 1;
      acc.ventas += Number(local.ventas || 0);
      acc.facturado += Number(local.facturado || 0);
      return acc;
    }, { locales: 0, activos: 0, ventas: 0, facturado: 0 });

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      totales,
      locales: resumen.rows.map(local => ({
        ...local,
        ventas: Number(local.ventas || 0),
        facturado: Number(local.facturado || 0),
        ticket_promedio: Number(local.ticket_promedio || 0)
      })),
      ventasPorDia: porDia.rows.map(row => ({
        ...row,
        ventas: Number(row.ventas || 0),
        facturado: Number(row.facturado || 0)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dueno-dashboard', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  if (!req.usuario.local_id) {
    return res.status(400).json({ error: 'No hay local seleccionado' });
  }
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const resumen = await pool.query(
      `SELECT COUNT(*) as ventas,
        COALESCE(SUM(total), 0) as facturado,
        COALESCE(SUM(descuento), 0) as descuentos,
        COALESCE(AVG(total), 0) as ticket_promedio
       FROM ventas
       WHERE local_id = $1
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2`,
      [req.usuario.local_id, hoy]
    );

    const ganancias = await pool.query(
      `SELECT COALESCE(SUM((vi.precio_unitario - p.costo) * vi.cantidad), 0) as ganancia
       FROM venta_items vi
       JOIN ventas v ON vi.venta_id = v.id
       JOIN productos p ON vi.producto_id = p.id
       WHERE v.local_id = $1
       AND DATE(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2`,
      [req.usuario.local_id, hoy]
    );

    const turnosActivos = await pool.query(
      `SELECT t.id, t.usuario_id, t.usuario_nombre, t.monto_apertura,
        (t.fecha_apertura AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha_apertura,
        COUNT(v.id) as ventas,
        COALESCE(SUM(v.total), 0) as facturado
       FROM turnos t
       LEFT JOIN ventas v ON v.turno_id = t.id
       WHERE t.local_id = $1 AND t.estado = 'abierto'
       GROUP BY t.id
       ORDER BY t.fecha_apertura DESC`,
      [req.usuario.local_id]
    );

    const ultimasVentas = await pool.query(
      `SELECT v.id, v.total, v.metodo_pago, v.created_at, u.nombre as cajero,
        json_agg(json_build_object(
          'nombre', vi.nombre_producto,
          'cantidad', vi.cantidad,
          'unidad_medida', COALESCE(vi.unidad_medida, 'unidad')
        ) ORDER BY vi.id) as items
       FROM ventas v
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN venta_items vi ON vi.venta_id = v.id
       WHERE v.local_id = $1
       GROUP BY v.id, u.nombre
       ORDER BY v.created_at DESC
       LIMIT 8`,
      [req.usuario.local_id]
    );

    const stockBajo = await pool.query(
      `SELECT id, nombre, stock, stock_min, COALESCE(unidad_medida, 'unidad') as unidad_medida
       FROM productos
       WHERE local_id = $1 AND activo = true AND stock <= stock_min
       ORDER BY stock ASC, nombre ASC
       LIMIT 8`,
      [req.usuario.local_id]
    );

    const ventasPorHora = await pool.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as hora,
        COUNT(*) as ventas,
        COALESCE(SUM(total), 0) as facturado
       FROM ventas
       WHERE local_id = $1
       AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2
       GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')
       ORDER BY hora ASC`,
      [req.usuario.local_id, hoy]
    );

    res.json({
      fecha: hoy,
      resumen: {
        ventas: Number(resumen.rows[0].ventas || 0),
        facturado: Number(resumen.rows[0].facturado || 0),
        descuentos: Number(resumen.rows[0].descuentos || 0),
        ticket_promedio: Number(resumen.rows[0].ticket_promedio || 0),
        ganancia: Number(ganancias.rows[0].ganancia || 0)
      },
      turnosActivos: turnosActivos.rows.map(t => ({
        ...t,
        ventas: Number(t.ventas || 0),
        facturado: Number(t.facturado || 0),
        monto_apertura: Number(t.monto_apertura || 0)
      })),
      ultimasVentas: ultimasVentas.rows.map(v => ({ ...v, total: Number(v.total || 0) })),
      stockBajo: stockBajo.rows.map(p => ({
        ...p,
        stock: Number(p.stock || 0),
        stock_min: Number(p.stock_min || 0)
      })),
      ventasPorHora: ventasPorHora.rows.map(h => ({
        hora: Number(h.hora),
        ventas: Number(h.ventas || 0),
        facturado: Number(h.facturado || 0)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
