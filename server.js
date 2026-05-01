require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { iniciarCron } = require('./utils/cron');
require('./db');

const app = express();

app.use(cors());

app.use(express.json());
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