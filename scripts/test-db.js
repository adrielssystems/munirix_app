const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function testConnection() {
  console.log('[TEST-DB] Conectando a:', process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const res = await pool.query('SELECT NOW(), current_database(), version()');
    console.log('[TEST-DB] Conexión exitosa a PostgreSQL:');
    console.log(' - Base de Datos:', res.rows[0].current_database);
    console.log(' - Hora Servidor:', res.rows[0].now);
    console.log(' - Versión:', res.rows[0].version);

    const tenants = await pool.query('SELECT * FROM tenants');
    console.log(`[TEST-DB] Tenants encontrados (${tenants.rowCount}):`, tenants.rows);

    const users = await pool.query('SELECT id, tenant_id, name, email, role FROM users');
    console.log(`[TEST-DB] Usuarios encontrados (${users.rowCount}):`, users.rows);

    console.log('[TEST-DB] Todo verificado al 100%.');
    process.exit(0);
  } catch (err) {
    console.error('[TEST-DB] Error de conexión:', err);
    process.exit(1);
  }
}

testConnection();
