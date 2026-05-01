const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');
const { crearOrdenQR } = require('../utils/mercadopago');

// POST - Crear orden de pago QR
router.post('/qr', verificarToken, async (req, res) => {
  try {
    const { items, total } = req.body;

    // Obtener access token del local
    const localResult = await pool.query(
      'SELECT mp_access_token FROM locales WHERE id = $1',
      [req.usuario.local_id]
    );

    const accessToken = localResult.rows[0]?.mp_access_token;
    if (!accessToken) {
      return res.status(400).json({ error: 'El local no tiene MercadoPago configurado' });
    }

    const orden = await crearOrdenQR(
      accessToken,
      items,
      total,
      `venta-${Date.now()}`
    );

    res.json(orden);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;