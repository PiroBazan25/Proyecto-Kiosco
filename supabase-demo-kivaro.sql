-- Demo limpio para presentar Kivaro.
-- Ejecutar manualmente en Supabase SQL Editor solo cuando quieras recrear el local demo.
-- Usuario demo: demo@kivaro.com
-- PIN demo: 1234

BEGIN;

DO $$
DECLARE
  v_local_id integer;
BEGIN
  SELECT id INTO v_local_id
  FROM locales
  WHERE nombre = 'Kivaro Demo Market'
  LIMIT 1;

  IF v_local_id IS NULL THEN
    INSERT INTO locales (nombre, direccion, telefono, plan, suscripcion_activa, suscripcion_vence, config)
    VALUES (
      'Kivaro Demo Market',
      'Local demo',
      '+54 9 380 434-5006',
      'premium',
      true,
      CURRENT_DATE + INTERVAL '30 days',
      '{"mensajeTicket":"Gracias por probar Kivaro"}'::jsonb
    )
    RETURNING id INTO v_local_id;
  END IF;

  DELETE FROM venta_items WHERE venta_id IN (SELECT id FROM ventas WHERE local_id = v_local_id);
  DELETE FROM ventas WHERE local_id = v_local_id;
  DELETE FROM compra_items WHERE compra_id IN (SELECT id FROM compras WHERE local_id = v_local_id);
  DELETE FROM compras WHERE local_id = v_local_id;
  DELETE FROM fiado WHERE local_id = v_local_id;
  DELETE FROM clientes WHERE local_id = v_local_id;
  DELETE FROM turnos WHERE local_id = v_local_id;
  DELETE FROM proveedores WHERE local_id = v_local_id;
  DELETE FROM productos WHERE local_id = v_local_id;
  DELETE FROM usuarios WHERE local_id = v_local_id;

  INSERT INTO usuarios (local_id, nombre, email, pin_hash, rol, activo)
  VALUES (
    v_local_id,
    'Dueño Demo',
    'demo@kivaro.com',
    '$2b$10$xAqr0TtaDKP3xmheJMVJse/jIK7Ix7zLu5to85NyvRCuDawwH5aRm',
    'admin_local',
    true
  );

  INSERT INTO productos (local_id, nombre, categoria, precio, costo, stock, stock_min, cod_barras, unidad_medida)
  VALUES
    (v_local_id, 'Coca Cola 500ml', 'Bebidas', 1200, 850, 48, 10, '7790001000011', 'unidad'),
    (v_local_id, 'Agua mineral 1.5L', 'Bebidas', 950, 600, 35, 8, '7790001000012', 'unidad'),
    (v_local_id, 'Papas fritas 150g', 'Snacks', 2500, 1700, 12, 5, '7790001000013', 'unidad'),
    (v_local_id, 'Alfajor triple', 'Golosinas', 900, 550, 30, 8, '7790001000014', 'unidad'),
    (v_local_id, 'Pan frances', 'Panaderia', 2500, 1700, 8, 3, '7790001000015', 'kg'),
    (v_local_id, 'Jamon cocido', 'Fiambre', 6800, 4900, 4, 2, '7790001000016', 'kg'),
    (v_local_id, 'Leche entera 1L', 'Lacteos', 1400, 1000, 18, 6, '7790001000017', 'unidad'),
    (v_local_id, 'Yerba mate 1kg', 'Almacen', 4200, 3100, 15, 4, '7790001000018', 'unidad');

  INSERT INTO proveedores (local_id, nombre, contacto, telefono, email)
  VALUES
    (v_local_id, 'Distribuidora Demo', 'Ventas', '+54 9 380 000-0000', 'demo@proveedor.com');

  INSERT INTO clientes (local_id, nombre, telefono, email, notas)
  VALUES
    (v_local_id, 'Cliente Demo', '+54 9 380 111-1111', 'cliente@demo.com', 'Cliente de muestra');
END $$;

COMMIT;
