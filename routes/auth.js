const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const intentosLogin = new Map();
const MAX_INTENTOS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const VENTANA_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000);

function ipCliente(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

function claveIntento(req, email) {
  return `${ipCliente(req)}:${String(email || '').trim().toLowerCase()}`;
}

function obtenerIntento(clave) {
  const ahora = Date.now();
  const intento = intentosLogin.get(clave);
  if (!intento || intento.expira <= ahora) {
    intentosLogin.delete(clave);
    return { cantidad: 0, expira: ahora + VENTANA_MS };
  }
  return intento;
}

function registrarFallo(clave) {
  const intento = obtenerIntento(clave);
  intento.cantidad += 1;
  intento.expira = Date.now() + VENTANA_MS;
  intentosLogin.set(clave, intento);
}

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const pin = String(req.body.pin || '');
  const clave = claveIntento(req, email);
  const intento = obtenerIntento(clave);

  if (!email || !pin) {
    return res.status(400).json({ error: 'Completá email y PIN' });
  }
  if (pin.length > 32) {
    return res.status(400).json({ error: 'PIN inválido' });
  }
  if (intento.cantidad >= MAX_INTENTOS) {
    return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
  }

  try {
    const result = await pool.query(
      'SELECT u.*, l.nombre as local_nombre, l.suscripcion_activa FROM usuarios u LEFT JOIN locales l ON u.local_id = l.id WHERE u.email = $1 AND u.activo = true',
      [email]
    );

    const usuario = result.rows[0];

    if (!usuario) {
      registrarFallo(clave);
      return res.status(401).json({ error: 'Email o PIN incorrecto' });
    }

    const pinValido = await bcrypt.compare(pin, usuario.pin_hash);
    if (!pinValido) {
      registrarFallo(clave);
      return res.status(401).json({ error: 'Email o PIN incorrecto' });
    }

    if (usuario.rol !== 'superadmin' && !usuario.suscripcion_activa) {
      return res.status(403).json({ error: 'Suscripción vencida. Contactá al soporte.' });
    }

    intentosLogin.delete(clave);

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, local_id: usuario.local_id },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        local_id: usuario.local_id,
        local_nombre: usuario.local_nombre
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
