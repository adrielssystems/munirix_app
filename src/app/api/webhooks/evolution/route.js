import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getTenantByEvolutionInstance } from '@/lib/tenants';
import { decryptSecret } from '@/lib/crypto';
import { runTenantAIAgent } from '@/lib/ai/agent';
import { sendWhatsAppText } from '@/lib/meta/whatsapp';
import { updateAppointmentState } from '@/lib/scheduling/slots';

export const dynamic = 'force-dynamic';

function extractEvolutionText(messageObj) {
  if (!messageObj) return '';
  return (
    messageObj.conversation ||
    messageObj.extendedTextMessage?.text ||
    messageObj.imageMessage?.caption ||
    messageObj.videoMessage?.caption ||
    messageObj.buttonsResponseMessage?.selectedDisplayText ||
    messageObj.listResponseMessage?.title ||
    ''
  );
}

/**
 * Webhook receptor de Evolution API v2 (MESSAGES_UPSERT, CONNECTION_UPDATE).
 * Enruta dinámicamente por nombre de instancia (body.instance o ?instance=...)
 */
export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json();

    const eventName = String(body.event || '').toLowerCase();
    const instanceName = body.instance || searchParams.get('instance') || null;
    const tenantConfig = await getTenantByEvolutionInstance(instanceName);

    await query(
      `INSERT INTO webhook_logs (tenant_id, channel, event_type, payload)
       VALUES ($1, 'whatsapp_evolution', $2, $3)`,
      [tenantConfig?.tenant_id || null, eventName || 'evolution_event', JSON.stringify(body)]
    );

    if (!tenantConfig) {
      return NextResponse.json({ status: 'instance_not_registered', instance: instanceName });
    }

    // Validar apikey si el header viene presente y el tenant configuró clave
    const incomingApiKey = req.headers.get('apikey') || body.apikey;
    const storedApiKey = decryptSecret(tenantConfig.evolution_api_key_encrypted);
    if (storedApiKey && incomingApiKey && incomingApiKey !== storedApiKey) {
      return NextResponse.json({ error: 'API Key de Evolution inválida' }, { status: 401 });
    }

    if (!eventName.includes('messages.upsert') && eventName !== 'messages_upsert') {
      return NextResponse.json({ status: 'ignored_event', event: eventName });
    }

    const data = body.data || {};
    const key = data.key || {};

    // Ignorar mensajes enviados por nosotros mismos o grupos (@g.us)
    if (key.fromMe) {
      return NextResponse.json({ status: 'ignored_from_me' });
    }
    const remoteJid = String(key.remoteJid || '');
    if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      return NextResponse.json({ status: 'ignored_group_or_status' });
    }

    const tenantId = tenantConfig.tenant_id;
    const externalMessageId = key.id || null;
    const senderNumber = remoteJid.split('@')[0].replace(/[^\d]/g, '');
    const contactName = data.pushName || `Cliente ${senderNumber}`;
    const messageText = extractEvolutionText(data.message).trim();

    if (!messageText) {
      return NextResponse.json({ status: 'ignored_empty_text' });
    }

    // Idempotencia por key.id
    if (externalMessageId) {
      const dup = await query(
        `SELECT id FROM messages WHERE tenant_id = $1 AND external_message_id = $2 LIMIT 1`,
        [tenantId, externalMessageId]
      );
      if (dup.rowCount > 0) {
        return NextResponse.json({ status: 'duplicate_ignored', id: externalMessageId });
      }
    }

    // 1. Upsert Contacto
    const contactRes = await query(
      `INSERT INTO contacts (tenant_id, name, phone, external_id, channel, last_interaction_at)
       VALUES ($1, $2, $3, $3, 'whatsapp', NOW())
       ON CONFLICT (tenant_id, channel, external_id)
       DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
         phone = COALESCE(NULLIF(EXCLUDED.phone, ''), contacts.phone),
         last_interaction_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [tenantId, contactName, senderNumber]
    );
    const contactId = contactRes.rows[0].id;

    // 2. Upsert Conversación
    const convRes = await query(
      `INSERT INTO conversations (tenant_id, contact_id, channel, session_id, last_message_preview, last_message_at, unread_count)
       VALUES ($1, $2, 'whatsapp', $3, $4, NOW(), 1)
       ON CONFLICT (tenant_id, channel, session_id)
       DO UPDATE SET
         last_message_preview = EXCLUDED.last_message_preview,
         last_message_at = NOW(),
         unread_count = conversations.unread_count + 1,
         updated_at = NOW()
       RETURNING id, ai_enabled`,
      [tenantId, contactId, senderNumber, messageText]
    );
    const conversation = convRes.rows[0];

    // 3. Guardar Mensaje entrante
    const savedMsgRes = await query(
      `INSERT INTO messages (tenant_id, conversation_id, sender_type, sender_id, content, message_type, external_message_id, delivery_status, payload)
       VALUES ($1, $2, 'contact', $3, $4, 'text', $5, 'received', $6::jsonb)
       ON CONFLICT (tenant_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [tenantId, conversation.id, senderNumber, messageText, externalMessageId, JSON.stringify(data)]
    );
    const savedMessageId = savedMsgRes.rows[0]?.id || null;

    // 4. Respuesta rápida a recordatorio en Evolution ("1" o "Confirmar")
    let aiOutcome = null;
    const normalizedReply = messageText.toLowerCase().trim();
    if (['1', 'confirmar', 'confirmo', 'si confirmo', 'sí confirmo'].includes(normalizedReply)) {
      const nextAptRes = await query(
        `SELECT id FROM appointments
         WHERE tenant_id = $1 AND contact_id = $2 AND status = 'scheduled' AND start_at >= NOW()
         ORDER BY start_at ASC LIMIT 1`,
        [tenantId, contactId]
      );
      if (nextAptRes.rowCount > 0) {
        const confirmed = await updateAppointmentState({
          tenantId,
          appointmentId: nextAptRes.rows[0].id,
          status: 'confirmed',
        });
        await sendWhatsAppText({
          tenantId,
          toPhone: senderNumber,
          conversationId: conversation.id,
          text: `¡Perfecto, ${contactName}! Tu cita del ${confirmed.formattedStart} ha quedado confirmada. Te esperamos.`,
        });
        return NextResponse.json({ status: 'appointment_confirmed', appointment_id: nextAptRes.rows[0].id });
      }
    }

    // 5. Debounce humano (esperar unos segundos por si el usuario envía varios mensajes seguidos)
    const debounceMs = Math.max(0, Number(process.env.AI_DEBOUNCE_MS ?? 6000));
    if (debounceMs > 0 && savedMessageId && conversation.ai_enabled && tenantConfig.bot_enabled) {
      await new Promise((resolve) => setTimeout(resolve, debounceMs));

      const latestCheck = await query(
        `SELECT m.id, c.ai_enabled
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.conversation_id = $1 AND m.sender_type = 'contact'
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1`,
        [conversation.id]
      );
      const latestRow = latestCheck.rows[0];
      if (!latestRow || latestRow.id !== savedMessageId || !latestRow.ai_enabled) {
        return NextResponse.json({ status: 'debounced_newer_message_arrived' });
      }
    }

    // 6. Ejecutar Agente IA Multitenant y responder vía Evolution API
    if (conversation.ai_enabled && tenantConfig.bot_enabled) {
      if (tenantConfig.tenant_status === 'trial') {
        const usageRes = await query(
          `SELECT COUNT(*)::int AS total FROM messages WHERE tenant_id = $1 AND sender_type = 'bot'`,
          [tenantId]
        );
        if ((usageRes.rows[0]?.total || 0) >= 150) {
          return NextResponse.json({ status: 'trial_message_limit_reached' });
        }
      }
      try {
        aiOutcome = await runTenantAIAgent({
          tenantId,
          contactId,
          conversationId: conversation.id,
          userMessage: messageText,
          channel: 'whatsapp',
        });

        if (aiOutcome?.reply) {
          await sendWhatsAppText({
            tenantId,
            toPhone: senderNumber,
            conversationId: conversation.id,
            text: aiOutcome.reply,
          });
        }
      } catch (aiErr) {
        console.error('[EVOLUTION AI AGENT ERROR]:', aiErr.message);
        aiOutcome = { error: aiErr.message };
      }
    }

    return NextResponse.json({
      status: 'processed_evolution',
      tenant_id: tenantId,
      conversation_id: conversation.id,
      ai: aiOutcome,
    });
  } catch (error) {
    console.error('[EVOLUTION WEBHOOK ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

