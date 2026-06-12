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

async function crearPagoPlan(accessToken, plan, comprador, baseUrl) {
  const precios = {
    basico: { nombre: 'Plan Basico Kivaro', precio: 100000 },
    premium: { nombre: 'Plan Premium Kivaro', precio: 200000 }
  };
  const seleccionado = precios[plan];
  if (!seleccionado) {
    throw new Error('Plan invalido');
  }

  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);
  const externalReference = `kivaro-${plan}-${Date.now()}`;
  const nombreComprador = comprador?.nombre || 'Cliente Kivaro';
  const negocio = comprador?.negocio ? ` - ${comprador.negocio}` : '';

  const response = await preference.create({
    body: {
      items: [
        {
          title: `${seleccionado.nombre}${negocio}`,
          quantity: 1,
          unit_price: seleccionado.precio,
          currency_id: 'ARS'
        }
      ],
      payer: {
        name: nombreComprador,
        email: comprador?.email || undefined
      },
      external_reference: externalReference,
      back_urls: {
        success: `${baseUrl}/planes.html?estado=aprobado&plan=${plan}`,
        failure: `${baseUrl}/planes.html?estado=fallido&plan=${plan}`,
        pending: `${baseUrl}/planes.html?estado=pendiente&plan=${plan}`
      },
      notification_url: process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/api/pagos/webhook` : undefined,
      metadata: {
        plan,
        nombre: comprador?.nombre || '',
        email: comprador?.email || '',
        telefono: comprador?.telefono || '',
        negocio: comprador?.negocio || ''
      }
    }
  });

  return {
    ok: true,
    preference_id: response.id,
    init_point: response.init_point,
    external_reference: externalReference
  };
}

module.exports = { crearOrdenQR, crearPagoPlan };
