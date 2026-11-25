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

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('[MIGRATE] DATABASE_URL no definida.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
