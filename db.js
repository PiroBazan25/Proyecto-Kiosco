const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.message);
  } else {
    await client.query("SET timezone='America/Argentina/Buenos_Aires'");
    release();
    console.log('Conectado a Supabase correctamente');
  }
});

module.exports = pool;