const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');

// Abrir turno
router.post('/abrir', verificarToken, async (req, res) => {
  try {
    const turnoAbierto = await pool.query(
      'SELECT * FROM turnos WHERE usuario_id = $1 AND local_id = $2 AND estado = $3',
      [req.usuario.id, req.usuario.local_id, 'abierto']
    );
    if (turnoAbierto.rows.length > 0) {
      return res.json({ turno: turnoAbierto.rows[0], yaAbierto: true });
    }
    const { monto_apertura } = req.body;
    const usuario = await pool.query(
      'SELECT nombre FROM usuarios WHERE id = $1 AND local_id = $2',
      [req.usuario.id, req.usuario.local_id]
    );
    const result = await pool.query(
      'INSERT INTO turnos (local_id, usuario_id, usuario_nombre, monto_apertura) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.usuario.local_id, req.usuario.id, usuario.rows[0]?.nombre || 'Usuario', monto_apertura || 0]
    );
    res.json({ turno: result.rows[0], yaAbierto: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cerrar turno
router.post('/cerrar', verificarToken, async (req, res) => {
  try {
    const turno = await pool.query(
      'SELECT * FROM turnos WHERE usuario_id = $1 AND local_id = $2 AND estado = $3',
      [req.usuario.id, req.usuario.local_id, 'abierto']
    );
    if (turno.rows.length === 0) {
      return res.status(404).json({ error: 'No hay turno abierto' });
    }
    const t = turno.rows[0];
    const ventas = await pool.query(
      'SELECT COUNT(*) as cantidad, COALESCE(SUM(total),0) as total FROM ventas WHERE turno_id = $1',
      [t.id]
    );
    const { monto_cierre } = req.body;
    const result = await pool.query(
      `UPDATE turnos SET 
        fecha_cierre = NOW(),
        estado = 'cerrado',
        monto_cierre = $1,
        total_ventas = $2,
        cantidad_ventas = $3
       WHERE id = $4 RETURNING *`,
      [monto_cierre || 0, ventas.rows[0].total, ventas.rows[0].cantidad, t.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Turno actual
router.get('/actual', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
  `SELECT *,
    (fecha_apertura AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha_apertura
   FROM turnos WHERE usuario_id = $1 AND local_id = $2 AND estado = $3`,
  [req.usuario.id, req.usuario.local_id, 'abierto']
);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de turnos
router.get('/historial', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const turnos = await pool.query(
  `SELECT t.*,
    (t.fecha_apertura AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha_apertura,
    (t.fecha_cierre AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') as fecha_cierre
   FROM turnos t
   WHERE t.local_id = $1
   ORDER BY t.fecha_apertura DESC`,
  [req.usuario.local_id]
);

    const resultado = await Promise.all(turnos.rows.map(async (t) => {
      const ventas = await pool.query(
        `SELECT v.id, v.total, v.metodo_pago, v.created_at,
          json_agg(json_build_object(
            'nombre_producto', vi.nombre_producto,
            'cantidad', vi.cantidad,
            'unidad_medida', COALESCE(vi.unidad_medida, 'unidad'),
            'precio_unitario', vi.precio_unitario
          )) as items
         FROM ventas v
         LEFT JOIN venta_items vi ON vi.venta_id = v.id
         WHERE v.turno_id = $1
         GROUP BY v.id
         ORDER BY v.created_at`,
        [t.id]
      );
      return { ...t, ventas: ventas.rows };
    }));

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
