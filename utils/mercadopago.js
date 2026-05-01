const { MercadoPagoConfig, Preference } = require('mercadopago');

async function crearOrdenQR(accessToken, items, total, externalReference) {
  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    
    const response = await preference.create({
      body: {
        items: items.map(i => ({
          title: String(i.nombre),
          quantity: Number(i.cantidad),
          unit_price: parseFloat(i.precio),
          currency_id: 'ARS'
        })),
        external_reference: String(externalReference)
      }
    });

    return {
      ok: true,
      preference_id: response.id,
      init_point: response.init_point
    };
  } catch(err) {
    console.error('Error MP:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { crearOrdenQR };