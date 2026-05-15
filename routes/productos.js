const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware para verificar token
const verificarToken = require('../middleware/auth');
const UNIDADES_VALIDAS = ['unidad', 'kg', 'g', 'l', 'ml'];

function validarUnidad(unidad) {
  return UNIDADES_VALIDAS.includes(unidad) ? unidad : 'unidad';
}

function numero(valor, defecto = 0) {
  const n = Number(String(valor ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : defecto;
}

// GET - Listar productos del local
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM productos WHERE local_id = $1 AND activo = true ORDER BY nombre',
      [req.usuario.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Crear producto
router.post('/', verificarToken, async (req, res) => {
  const { nombre, categoria, precio, costo, stock, stock_min, cod_barras, unidad_medida } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO productos (local_id, nombre, categoria, precio, costo, stock, stock_min, cod_barras, unidad_medida) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.usuario.local_id, nombre, categoria, precio, costo, stock || 0, stock_min || 5, cod_barras, validarUnidad(unidad_medida)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Importar productos desde CSV/Excel convertido a JSON
router.post('/importar', verificarToken, async (req, res) => {
  const { productos } = req.body;
  if (!Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'No hay productos para importar' });
  }

  const client = await pool.connect();
  const resultado = { creados: 0, actualizados: 0, errores: [] };

  try {
    await client.query('BEGIN');

    for (let i = 0; i < productos.length; i++) {
      const fila = productos[i];
      const linea = i + 2;
      const nombre = String(fila.nombre || '').trim();
      if (!nombre) {
        resultado.errores.push({ linea, error: 'Nombre requerido' });
        continue;
      }

      const categoria = String(fila.categoria || 'General').trim() || 'General';
      const precio = numero(fila.precio);
      const costo = numero(fila.costo);
      const stock = numero(fila.stock);
      const stockMin = numero(fila.stock_min, 5);
      const codBarras = String(fila.cod_barras || '').trim() || null;
      const unidad = validarUnidad(String(fila.unidad_medida || 'unidad').trim());

      if (precio < 0 || costo < 0 || stock < 0 || stockMin < 0) {
        resultado.errores.push({ linea, error: 'Valores numericos invalidos' });
        continue;
      }

      let existente = { rows: [] };
      if (codBarras) {
        existente = await client.query(
          'SELECT id FROM productos WHERE local_id = $1 AND cod_barras = $2 AND activo = true',
          [req.usuario.local_id, codBarras]
        );
      }

      if (existente.rows.length > 0) {
        await client.query(
          `UPDATE productos
           SET nombre=$1, categoria=$2, precio=$3, costo=$4, stock=$5, stock_min=$6, unidad_medida=$7
           WHERE id=$8 AND local_id=$9`,
          [nombre, categoria, precio, costo, stock, stockMin, unidad, existente.rows[0].id, req.usuario.local_id]
        );
        resultado.actualizados++;
      } else {
        await client.query(
          `INSERT INTO productos (local_id, nombre, categoria, precio, costo, stock, stock_min, cod_barras, unidad_medida)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.usuario.local_id, nombre, categoria, precio, costo, stock, stockMin, codBarras, unidad]
        );
        resultado.creados++;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, ...resultado });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT - Editar producto
router.put('/:id', verificarToken, async (req, res) => {
  const { nombre, categoria, precio, costo, stock, stock_min, cod_barras, unidad_medida } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  try {
    const result = await pool.query(
      'UPDATE productos SET nombre=$1, categoria=$2, precio=$3, costo=$4, stock=$5, stock_min=$6, cod_barras=$7, unidad_medida=$8 WHERE id=$9 AND local_id=$10 RETURNING *',
      [nombre, categoria, precio, costo, stock, stock_min, cod_barras, validarUnidad(unidad_medida), req.params.id, req.usuario.local_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Desactivar producto (no borrar)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE productos SET activo=false WHERE id=$1 AND local_id=$2',
      [req.params.id, req.usuario.local_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
