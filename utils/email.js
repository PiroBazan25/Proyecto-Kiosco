const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function enviarCredenciales({ nombre, email, pin, localNombre, rol }) {
  if (!resend) {
    console.log('Email no enviado - RESEND_API_KEY no configurada');
    return false;
  }
  try {
    await resend.emails.send({
      from: 'KioscoManager <onboarding@resend.dev>',
      to: email,
      subject: `Bienvenido a KioscoManager - Tus credenciales de acceso`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#3b82f6;padding:20px;border-radius:10px;text-align:center;margin-bottom:20px">
            <h1 style="color:white;margin:0">🏪 KioscoManager</h1>
            <p style="color:#bfdbfe;margin:8px 0 0">Sistema de gestión para kioscos</p>
          </div>
          <h2>¡Hola ${nombre}!</h2>
          <p>Tu cuenta ha sido creada exitosamente en <strong>KioscoManager</strong>.</p>
          <div style="background:#f1f5f9;padding:20px;border-radius:8px;margin:20px 0">
            <h3 style="margin-top:0">📋 Tus credenciales de acceso:</h3>
            <p><strong>Local:</strong> ${localNombre}</p>
            <p><strong>Rol:</strong> ${rol === 'admin_local' ? '👔 Dueño' : '🧾 Cajero'}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>PIN:</strong> <span style="font-size:24px;font-weight:bold;color:#3b82f6">${pin}</span></p>
          </div>
          <div style="background:#fef3c7;padding:16px;border-radius:8px;margin:20px 0">
            <p style="margin:0">⚠️ <strong>Importante:</strong> Guardá estas credenciales en un lugar seguro.</p>
          </div>
          <a href="https://proyecto-kiosco-production.up.railway.app" 
             style="background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
            Ingresar al sistema →
          </a>
        </div>
      `
    });
    console.log('Email enviado a:', email);
    return true;
  } catch (err) {
    console.error('Error enviando email:', err);
    return false;
  }
}

module.exports = { enviarCredenciales };