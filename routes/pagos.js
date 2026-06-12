const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middleware/auth');
const { crearOrdenQR, crearPagoPlan } = require('../utils/mercadopago');

function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

// POST - Crear pago publico de planes Kivaro
router.post('/planes', async (req, res) => {
  try {
    const accessToken = process.env.KIVARO_MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({ error: 'Falta configurar KIVARO_MP_ACCESS_TOKEN en Railway' });
    }
    const { plan, nombre, email, telefono, negocio } = req.body;
    if (!['basico', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalido' });
    }
    if (!nombre || !email || !telefono || !negocio) {
      return res.status(400).json({ error: 'Completá nombre, email, teléfono y negocio' });
    }
    const pago = await crearPagoPlan(accessToken, plan, { nombre, email, telefono, negocio }, baseUrl(req));
    res.json(pago);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Webhook MercadoPago para pagos de planes
router.post('/webhook', express.json({ type: '*/*' }), async (req, res) => {
  console.log('Webhook MercadoPago Kivaro:', JSON.stringify(req.body || {}));
  res.sendStatus(200);
});

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
