import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { encryptSecret, decryptSecret, signState, verifyState, verifyMetaSignature } from '../src/lib/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env.local') });

const { Pool } = pg;

async function main() {
  // 1. Verificar criptografía AES-256-GCM y HMAC
  const cipher = encryptSecret('sk-test-secret-1234');
  if (!cipher.startsWith('enc:v1:') || decryptSecret(cipher) !== 'sk-test-secret-1234') {
    throw new Error('Falló roundtrip AES-256-GCM');
  }
  const st = signState({ tenantId: 't1', iat: Date.now() });
  const parsed = verifyState(st);
  if (parsed?.tenantId !== 't1') throw new Error('Falló verificación HMAC state');
  if (!verifyMetaSignature('{"ok":true}', null, null)) throw new Error('Falló bypass dev Meta signature');
  console.log('[VERIFY] Crypto AES-256-GCM + HMAC: OK');

  // 2. Verificar PostgreSQL + migración 02 + seed Dermatología
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  try {
    const t = await pool.query(
      `SELECT id, name, industry, timezone, enabled_modules FROM tenants WHERE id = 'a0000000-0000-0000-0000-000000000001'`
    );
    const s = await pool.query(
      `SELECT id, name, duration_minutes, follow_up_days FROM services WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001' ORDER BY name`
    );
    const r = await pool.query(
      `SELECT COUNT(*)::int AS total FROM availability_rules WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'`
    );
    const ai = await pool.query(
      `SELECT provider, model FROM tenant_ai_configs WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'`
    );

    console.log('[VERIFY] Tenant Demo:', t.rows[0]);
    console.log(`[VERIFY] Servicios Dermatología (${s.rowCount}):`, s.rows.map((x) => `${x.name} (${x.duration_minutes}m)`));
    console.log('[VERIFY] Reglas de horario:', r.rows[0].total);
    console.log('[VERIFY] Config AI:', ai.rows[0]);

    // 3. Probar protección anti-doble-reserva (EXCLUDE USING gist) en transacción con ROLLBACK limpio
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cRes = await client.query(
        `INSERT INTO contacts (tenant_id, name, phone, external_id, channel)
         VALUES ('a0000000-0000-0000-0000-000000000001', 'Test Overlap', '58000000000', '58000000000', 'whatsapp')
         ON CONFLICT (tenant_id, channel, external_id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`
      );
      const cid = cRes.rows[0].id;
      const start = '2027-01-15T14:00:00Z';
      const end = '2027-01-15T14:30:00Z';
      await client.query(
        `INSERT INTO appointments (tenant_id, contact_id, title, start_at, end_at, status)
         VALUES ('a0000000-0000-0000-0000-000000000001', $1, 'Cita 1', $2, $3, 'scheduled')`,
        [cid, start, end]
      );
      let blocked = false;
      try {
        await client.query(
          `INSERT INTO appointments (tenant_id, contact_id, title, start_at, end_at, status)
           VALUES ('a0000000-0000-0000-0000-000000000001', $1, 'Cita Solapada', '2027-01-15T14:15:00Z', '2027-01-15T14:45:00Z', 'scheduled')`,
          [cid]
        );
      } catch (err) {
        if (err.code === '23P01') blocked = true;
      }
      await client.query('ROLLBACK');
      if (!blocked) throw new Error('EXCLUDE constraint no bloqueó doble reserva');
      console.log('[VERIFY] Constraint anti doble-reserva (23P01): OK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[VERIFY] ERROR:', err);
  process.exit(1);
});
