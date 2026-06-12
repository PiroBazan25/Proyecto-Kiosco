require('dotenv').config();
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { iniciarCron } = require('./utils/cron');
require('./db');

const app = express();

app.disable('x-powered-by');

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || process.env.PUBLIC_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = req.get('host');
    if (originUrl.host === host) return true;
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') return true;
    return allowedOrigins.has(origin);
  } catch (err) {
    return false;
  }
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(cors((req, callback) => {
  callback(null, {
    origin: isAllowedOrigin(req.header('Origin'), req)
  });
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/locales', require('./routes/locales'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/turnos', require('./routes/turnos'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/pagos', require('./routes/pagos'));

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, mensaje: 'KioscoManager API funcionando' });
});

const PORT = process.env.PORT || 8080;
iniciarCron();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
