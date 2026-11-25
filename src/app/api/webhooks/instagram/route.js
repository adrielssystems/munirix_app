import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getTenantByMetaIdentifier } from '@/lib/tenants';
import { verifyMetaSignature, decryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// 1. Verificación del Webhook de Meta (GET)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const defaultVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'munirix_verify_token_2026';

  if (mode === 'subscribe' && token) {
    if (token === defaultVerifyToken) {
      return new Response(challenge, { status: 200 });
    }
    const tenantTokenRes = await query(
      `SELECT id FROM tenant_meta_configs WHERE channel = 'instagram' AND verify_token = $1 AND is_active = true LIMIT 1`,
      [token]
    );
    if (tenantTokenRes.rowCount > 0) {
      return new Response(challenge, { status: 200 });
    }
  }

  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

// 2. Recepción de mensajes directos, comentarios y menciones de Instagram (POST)
export async function POST(req) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const body = JSON.parse(rawBody || '{}');

    if (process.env.META_APP_SECRET) {
      const valid = verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET);
      if (!valid) {
        return NextResponse.json({ error: 'Firma de webhook inválida' }, { status: 401 });
      }
    }

    const entry = body.entry?.[0];
    const pageOrAccountId = entry?.id || null;
    const tenantConfig = pageOrAccountId
      ? await getTenantByMetaIdentifier('instagram', pageOrAccountId)
      : null;

    await query(
      `INSERT INTO webhook_logs (tenant_id, channel, event_type, payload) VALUES ($1, $2, $3, $4)`,
      [tenantConfig?.tenant_id || null, 'instagram', 'meta_inbound', JSON.stringify(body)]
    );

    if (!entry) return NextResponse.json({ status: 'no_entry' });

    if (tenantConfig?.app_secret && !process.env.META_APP_SECRET) {
      const tenantSecret = decryptSecret(tenantConfig.app_secret);
      if (!verifyMetaSignature(rawBody, signature, tenantSecret)) {
        return NextResponse.json({ error: 'Firma de tenant inválida' }, { status: 401 });
      }
    }

    if (!tenantConfig) {
      console.warn(`[INSTAGRAM WEBHOOK] Evento recibido para Instagram/Page ID ${pageOrAccountId} sin Tenant registrado.`);
      return NextResponse.json({ status: 'tenant_not_found' });
    }

    const tenantId = tenantConfig.tenant_id;

    if (entry.messaging && entry.messaging.length > 0) {
      const messagingEvent = entry.messaging[0];
      const senderId = messagingEvent.sender?.id;
      const message = messagingEvent.message;

      if (!message || message.is_echo) {
        return NextResponse.json({ status: 'ignored_echo_or_empty' });
      }

      const externalMessageId = message.mid || null;
      if (externalMessageId) {
        const dup = await query(
          `SELECT id FROM messages WHERE tenant_id = $1 AND external_message_id = $2 LIMIT 1`,
          [tenantId, externalMessageId]
        );
        if (dup.rowCount > 0) {
          return NextResponse.json({ status: 'duplicate_ignored', mid: externalMessageId });
        }
      }

      const messageText = message.text || '[Multimedia]';

      const contactRes = await query(
        `INSERT INTO contacts (tenant_id, name, external_id, channel, last_interaction_at)
         VALUES ($1, $2, $3, 'instagram', NOW())
         ON CONFLICT (tenant_id, channel, external_id)
         DO UPDATE SET
           last_interaction_at = NOW(),
           updated_at = NOW()
         RETURNING id`,
        [tenantId, `Usuario IG ${senderId}`, senderId]
      );

      const contactId = contactRes.rows[0].id;

      const convRes = await query(
        `INSERT INTO conversations (tenant_id, contact_id, channel, session_id, last_message_preview, last_message_at, unread_count)
         VALUES ($1, $2, 'instagram', $3, $4, NOW(), 1)
         ON CONFLICT (tenant_id, channel, session_id)
         DO UPDATE SET
           last_message_preview = EXCLUDED.last_message_preview,
           last_message_at = NOW(),
           unread_count = conversations.unread_count + 1,
           updated_at = NOW()
         RETURNING id`,
        [tenantId, contactId, senderId, messageText]
      );

      const conversationId = convRes.rows[0].id;

      await query(
        `INSERT INTO messages (tenant_id, conversation_id, sender_type, sender_id, content, message_type, external_message_id, delivery_status, payload)
         VALUES ($1, $2, 'contact', $3, $4, 'text', $5, 'received', $6)
         ON CONFLICT (tenant_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING`,
        [tenantId, conversationId, senderId, messageText, externalMessageId, JSON.stringify(messagingEvent)]
      );

      return NextResponse.json({ status: 'processed_dm', tenant_id: tenantId, conversation_id: conversationId });
    }

    return NextResponse.json({ status: 'event_received_unhandled_type' });
  } catch (error) {
    console.error('[INSTAGRAM WEBHOOK ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

