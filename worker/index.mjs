import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const { Pool } = pg;
const POLL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 15000);
const GRAPH_VERSION = 'v21.0';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function decryptSecret(storedValue) {
  if (!storedValue || typeof storedValue !== 'string' || !storedValue.startsWith('enc:v1:')) {
    return storedValue;
  }
  const rawKey =
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    'munirix_dev_fallback_key_change_in_production_2026';
  const masterKey = crypto.createHash('sha256').update(String(rawKey)).digest();
  const [, , ivHex, tagHex, cipherHex] = storedValue.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]).toString('utf8');
}

function formatDate(date, tz = 'America/Caracas') {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

async function dispatchWhatsApp(job) {
  const { rows } = await pool.query(
    `SELECT t.name AS tenant_name, t.timezone,
            c.name AS contact_name, c.phone AS contact_phone,
            a.id AS appointment_id, a.title AS apt_title, a.start_at, a.status AS apt_status,
            s.preparation_notes,
            m.whatsapp_provider,
            m.phone_number_id, m.access_token, m.templates_config,
            m.evolution_api_url, m.evolution_instance, m.evolution_api_key_encrypted
     FROM tenants t
     JOIN contacts c ON c.id = $2
     LEFT JOIN appointments a ON a.id = $3
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN tenant_meta_configs m ON m.tenant_id = t.id AND m.channel = 'whatsapp' AND m.is_active = true
     WHERE t.id = $1
     LIMIT 1`,
    [job.tenant_id, job.contact_id, job.appointment_id]
  );

  const ctx = rows[0];
  if (!ctx || !ctx.contact_phone) {
    return { skipped: true, reason: 'missing_contact_phone' };
  }

  // No enviar recordatorios si la cita ya fue cancelada
  if (
    ['reminder_24h', 'reminder_2h', 'confirm_instant'].includes(job.job_type) &&
    ctx.apt_status === 'cancelled'
  ) {
    return { skipped: true, reason: 'appointment_cancelled' };
  }

  const whenStr = ctx.start_at ? formatDate(ctx.start_at, ctx.timezone) : '';
  const templates = ctx.templates_config || {};
  let text = '';
  let buttons = null;
  let templateName = null;

  if (job.job_type === 'confirm_instant') {
    text = `Hola ${ctx.contact_name}, tu cita de *${ctx.apt_title}* en *${ctx.tenant_name}* quedó agendada para el *${whenStr}*.${
      ctx.preparation_notes ? `\n\nIndicaciones previas: ${ctx.preparation_notes}` : ''
    }`;
  } else if (job.job_type === 'reminder_24h' || job.job_type === 'reminder_2h') {
    const label = job.job_type === 'reminder_24h' ? 'mañana' : 'en 2 horas';
    templateName = templates[job.job_type] || null;
    text = `Recordatorio de *${ctx.tenant_name}*: Hola ${ctx.contact_name}, te esperamos ${label} (*${whenStr}*) para tu *${ctx.apt_title}*. ¿Confirmas tu asistencia?`;
    buttons = [
      { id: `confirm_apt:${ctx.appointment_id}`, title: 'Confirmar' },
      { id: `reschedule_apt:${ctx.appointment_id}`, title: 'Reprogramar' },
    ];
  } else if (job.job_type === 'followup_post_visit') {
    templateName = templates.followup_post_visit || null;
    text = `Hola ${ctx.contact_name}, te escribimos de *${ctx.tenant_name}* para saber cómo te ha ido con tu tratamiento tras tu consulta de *${ctx.apt_title}*. ¿Deseas agendar tu cita de control?`;
  }

  // Enviar por Evolution API o Meta Graph API según configuración del tenant
  let externalId = null;
  let deliveryStatus = 'simulated_worker';
  const waProvider = ctx.whatsapp_provider || (ctx.evolution_instance ? 'evolution' : 'meta');

  if (waProvider === 'evolution' && ctx.evolution_instance) {
    const evoUrl = String(ctx.evolution_api_url || process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
    const evoKey = decryptSecret(ctx.evolution_api_key_encrypted) || process.env.EVOLUTION_API_KEY || '';
    if (evoUrl && evoKey) {
      const cleanNumber = String(ctx.contact_phone).replace(/[^\d]/g, '');
      const fullText = buttons
        ? `${text}\n\nResponde:\n1. *Confirmar*\n2. *Reprogramar*`
        : text;
      const res = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(ctx.evolution_instance)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({ number: cleanNumber, text: fullText, delay: 600 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || `Evolution API HTTP ${res.status}`);
      }
      externalId = json?.key?.id || null;
      deliveryStatus = 'sent_evolution';
    }
  } else if (ctx.phone_number_id && ctx.access_token) {
    const accessToken = decryptSecret(ctx.access_token);
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${ctx.phone_number_id}/messages`;

    let body;
    if (templateName) {
      body = {
        messaging_product: 'whatsapp',
        to: ctx.contact_phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: ctx.contact_name },
                { type: 'text', text: ctx.apt_title || 'Consulta' },
                { type: 'text', text: whenStr || ctx.tenant_name },
              ],
            },
          ],
        },
      };
    } else if (buttons) {
      body = {
        messaging_product: 'whatsapp',
        to: ctx.contact_phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        to: ctx.contact_phone,
        type: 'text',
        text: { body: text },
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error?.message || `Meta API HTTP ${res.status}`);
    }
    externalId = json?.messages?.[0]?.id || null;
    deliveryStatus = 'sent_meta';
  }

  // Registrar en el hilo de conversación del paciente para trazabilidad en Inbox
  const convRes = await pool.query(
    `SELECT id FROM conversations WHERE tenant_id = $1 AND contact_id = $2 AND channel = 'whatsapp' LIMIT 1`,
    [job.tenant_id, job.contact_id]
  );
  if (convRes.rowCount > 0) {
    const convId = convRes.rows[0].id;
    await pool.query(
      `INSERT INTO messages (tenant_id, conversation_id, sender_type, content, message_type, external_message_id, delivery_status, payload)
       VALUES ($1, $2, 'bot', $3, $4, $5, $6, $7::jsonb)`,
      [
        job.tenant_id,
        convId,
        text,
        buttons ? 'interactive' : 'text',
        externalId,
        deliveryStatus,
        JSON.stringify({ job_type: job.job_type, buttons }),
      ]
    );
    await pool.query(
      `UPDATE conversations SET last_message_preview = $1, last_message_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [text.slice(0, 180), convId]
    );
  }

  return { delivered: true, deliveryStatus, externalId };
}

async function processDueJobs() {
  const client = await pool.connect();
  let jobs = [];
  try {
    await client.query('BEGIN');
    const res = await client.query(`
      SELECT * FROM automation_jobs
      WHERE status = 'pending' AND run_at <= NOW() AND attempts < max_attempts
      ORDER BY run_at ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);
    jobs = res.rows;

    for (const job of jobs) {
      await client.query(
        `UPDATE automation_jobs SET status = 'processing', attempts = attempts + 1, locked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [job.id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[WORKER] Error reclamando jobs:', err.message);
  } finally {
    client.release();
  }

  for (const job of jobs) {
    try {
      const outcome = await dispatchWhatsApp(job);
      await pool.query(
        `UPDATE automation_jobs
         SET status = 'completed', completed_at = NOW(), last_error = NULL,
             payload = payload || $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [job.id, JSON.stringify({ outcome })]
      );
      console.log(`[WORKER] Job ${job.job_type} (${job.id}) completado.`);
    } catch (err) {
      const retryable = job.attempts + 1 < job.max_attempts;
      await pool.query(
        `UPDATE automation_jobs
         SET status = $2, last_error = $3,
             run_at = CASE WHEN $2 = 'pending' THEN NOW() + INTERVAL '5 minutes' ELSE run_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [job.id, retryable ? 'pending' : 'failed', err.message]
      );
      console.error(`[WORKER] Job ${job.id} falló:`, err.message);
    }
  }
}

console.log(`[MUNIRIX WORKER] Iniciado. Polling cada ${POLL_MS}ms.`);
processDueJobs();
const interval = setInterval(processDueJobs, POLL_MS);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`[MUNIRIX WORKER] Recibida señal ${sig}, cerrando...`);
    clearInterval(interval);
    await pool.end();
    process.exit(0);
  });
}
