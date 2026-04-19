router.get('/historial', verificarToken, async (req, res) => {
  if (!['admin_local', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  try {
    const turnos = await pool.query(
      `SELECT t.* FROM turnos t
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