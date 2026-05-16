const cron = require('node-cron');
const pool = require('../db');
const { enviarCredenciales } = require('./email');
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function enviarAvisoVencimiento(email, nombre, localNombre, diasRestantes, fechaVence) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: 'Kivaro <onboarding@resend.dev>',
      to: email,
      subject: `⚠️ Tu suscripción vence en ${diasRestantes} días - Kivaro`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#f59e0b;padding:20px;border-radius:10px;text-align:center;margin-bottom:20px">
            <h1 style="color:white;margin:0">⚠️ Kivaro</h1>
            <p style="color:#fef3c7;margin:8px 0 0">Aviso de vencimiento de suscripción</p>
          </div>
          <h2>Hola ${nombre}!</h2>
          <p>Te avisamos que la suscripción de <strong>${localNombre}</strong> vence en <strong>${diasRestantes} días</strong>.</p>
          <div style="background:#fef3c7;padding:20px;border-radius:8px;margin:20px 0">
            <p style="margin:0"><strong>Fecha de vencimiento:</strong> ${fechaVence}</p>
          </div>
          <p>Para renovar tu suscripción y seguir usando Kivaro contactá a tu administrador.</p>
          <p style="color:#ef4444"><strong>Si no renovás antes de la fecha de vencimiento tu acceso será suspendido automáticamente.</strong></p>
          <hr style="margin:30px 0;border:none;border-top:1px solid #e2e8f0">
          <p style="color:#94a3b8;font-size:12px">Kivaro — Sistema de gestión para markets y kioscos</p>
        </div>
      `
    });
    console.log(`Email de aviso enviado a ${email}`);
  } catch(err) {
    console.error('Error enviando aviso:', err);
  }
}

function iniciarCron() {
  // Ejecutar todos los dias a las 9am
  cron.schedule('0 9 * * *', async () => {
    console.log('Ejecutando cron de vencimientos...');
    try {
      // Buscar locales que vencen en 7 dias
      const proximos = await pool.query(`
        SELECT l.id, l.nombre, l.suscripcion_vence, u.nombre as dueno_nombre, u.email
        FROM locales l
        JOIN usuarios u ON u.local_id = l.id AND u.rol = 'admin_local'
        WHERE l.suscripcion_activa = true
        AND l.suscripcion_vence IS NOT NULL
        AND l.suscripcion_vence = CURRENT_DATE + INTERVAL '7 days'
      `);

      for (const local of proximos.rows) {
        await enviarAvisoVencimiento(
          local.email,
          local.dueno_nombre,
          local.nombre,
          7,
          new Date(local.suscripcion_vence).toLocaleDateString('es-AR')
        );
      }

      // Desactivar locales vencidos
      const vencidos = await pool.query(`
        UPDATE locales 
        SET suscripcion_activa = false
        WHERE suscripcion_activa = true
        AND suscripcion_vence IS NOT NULL
        AND suscripcion_vence < CURRENT_DATE
        RETURNING id, nombre
      `);

      if (vencidos.rows.length > 0) {
        console.log('Locales desactivados por vencimiento:', vencidos.rows.map(l => l.nombre));
      }

    } catch(err) {
      console.error('Error en cron de vencimientos:', err);
    }
  });

  console.log('Cron de vencimientos iniciado');
}

module.exports = { iniciarCron };
