import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const { Pool } = pg;

async function ensureDatabaseExists(connectionString, ssl) {
  const url = new URL(connectionString);
  const targetDb = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!targetDb || !/^[a-zA-Z0-9_]+$/.test(targetDb)) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString(), ssl });
  try {
    const res = await adminPool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDb]);
    if (res.rowCount === 0) {
      console.log(`[MIGRATE] Base de datos "${targetDb}" no existe. Creándola...`);
      await adminPool.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`[MIGRATE] Base de datos "${targetDb}" creada.`);
    }
  } catch (err) {
    console.warn(`[MIGRATE] Aviso verificando/creando BD "${targetDb}": ${err.message}`);
  } finally {
    await adminPool.end();
  }
}

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('[MIGRATE] DATABASE_URL no definida.');
    process.exit(1);
  }

  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;

  await ensureDatabaseExists(process.env.DATABASE_URL, ssl);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
  });

  try {
    const initDbDir = path.join(rootDir, 'init-db');
    const files = fs
      .readdirSync(initDbDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`[MIGRATE] Ejecutando ${files.length} archivos SQL en ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

    for (const file of files) {
      const fullPath = path.join(initDbDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      console.log(` -> Aplicando ${file}...`);
      await pool.query(sql);
      console.log(`    OK: ${file}`);
    }

    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('[MIGRATE] Tablas activas:', tablesRes.rows.map((r) => r.table_name).join(', '));
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATE] Error aplicando migraciones:', err);
    await pool.end();
    process.exit(1);
  }
}

migrate();
