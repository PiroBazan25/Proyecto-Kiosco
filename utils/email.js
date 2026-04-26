const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarCredenciales({ nombre, email, pin, localNombre, rol }) {
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
            <p style="margin:0">⚠️ <strong>Importante:</strong> Guardá estas credenciales en un lugar seguro. Tu PIN es personal e intransferible.</p>
          </div>
          
          <p>Para ingresar al sistema visitá:</p>
          <a href="https://proyecto-kiosco-production.up.railway.app" 
             style="background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
            Ingresar al sistema →
          </a>
          
          <hr style="margin:30px 0;border:none;border-top:1px solid #e2e8f0">
          <p style="color:#94a3b8;font-size:12px">
            Este email fue enviado automáticamente por KioscoManager. 
            Si tenés algún problema contactá a tu administrador.
          </p>
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