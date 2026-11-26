import { config } from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

config({ path: '.env.local' });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const email = process.env.SUPERADMIN_EMAIL || 'adriels.systems@gmail.com';
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!password) {
    console.error('Define SUPERADMIN_PASSWORD en tus variables de entorno antes de ejecutar este script.');
    process.exit(1);
  }
  const role = 'superadmin';
  const name = 'Adriel Systems';

  console.log('Generando hash de contraseña...');
  const hash = await bcrypt.hash(password, 10);

  try {
    const res = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3, role = $4
       RETURNING id, email, role;`,
      [name, email, hash, role]
    );
    console.log('Superusuario creado/actualizado exitosamente:', res.rows[0]);
  } catch (err) {
    console.error('Error al crear el superusuario:', err);
  } finally {
    process.exit(0);
  }
}

main();
