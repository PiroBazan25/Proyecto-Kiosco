const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

router.post('/login', async (req, res) => {
  const { email, pin } = req.body;

  try {
    const result = await pool.query(
      'SELECT u.*, l.nombre as local_nombre, l.suscripcion_activa FROM usuarios u LEFT JOIN locales l ON u.local_id = l.id WHERE u.email = $1 AND u.activo = true',
      [email]
    );

    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const pinValido = await bcrypt.compare(pin, usuario.pin_hash);
    if (!pinValido) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    if (usuario.rol !== 'superadmin' && !usuario.suscripcion_activa) {
      return res.status(403).json({ error: 'Suscripción vencida. Contactá al soporte.' });
    }

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