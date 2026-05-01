const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

async function crearOrdenQR(accessToken, items, total, externalReference) {
  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    
    const response = await preference.create({
      body: {
        items: items.map(i => ({
          title: i.nombre,
          quantity: i.cantidad,
          unit_price: parseFloat(i.precio),
          currency_id: 'ARS'
        })),
        external_reference: externalReference,
        back_urls: {
          success: 'https://proyecto-kiosco-production.up.railway.app',
          failure: 'https://proyecto-kiosco-production.up.railway.app',
        },
        auto_approve: true
      }
    });

    return {
      ok: true,
      preference_id: response.id,
      init_point: response.init_point,
      qr_url: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${response.id}`
    };
  } catch(err) {
    console.error('Error MP:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = { crearOrdenQR };