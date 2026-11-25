import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getTenantByMetaIdentifier } from '@/lib/tenants';
import { verifyMetaSignature, decryptSecret } from '@/lib/crypto';
import { runTenantAIAgent } from '@/lib/ai/agent';
import { sendWhatsAppText } from '@/lib/meta/whatsapp';
import { updateAppointmentState } from '@/lib/scheduling/slots';

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
    // También permitir tokens de verificación específicos por tenant
    const tenantTokenRes = await query(
      `SELECT id FROM tenant_meta_configs WHERE channel = 'whatsapp' AND verify_token = $1 AND is_active = true LIMIT 1`,
      [token]
    );
    if (tenantTokenRes.rowCount > 0) {
      return new Response(challenge, { status: 200 });
    }
  }

  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

// 2. Recepción de mensajes y eventos de WhatsApp (POST)
export async function POST(req) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const body = JSON.parse(rawBody || '{}');

    // Validación global si META_APP_SECRET está configurado
    if (process.env.META_APP_SECRET) {
      const valid = verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET);
      if (!valid) {
        return NextResponse.json({ error: 'Firma de webhook inválida' }, { status: 401 });
      }
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const phoneNumberId = value?.metadata?.phone_number_id || null;

    // Resolver Tenant dinámicamente según el número receptor de WhatsApp
    const tenantConfig = phoneNumberId
      ? await getTenantByMetaIdentifier('whatsapp', phoneNumberId)
      : null;

    // Guardar log crudo del webhook (vinculado al tenant si se resolvió)
    await query(
      `INSERT INTO webhook_logs (tenant_id, channel, event_type, payload) VALUES ($1, $2, $3, $4)`,
      [tenantConfig?.tenant_id || null, 'whatsapp', 'meta_inbound', JSON.stringify(body)]
    );

    // Validación de firma específica del tenant si tiene app_secret propio
    if (tenantConfig?.app_secret && !process.env.META_APP_SECRET) {
      const tenantSecret = decryptSecret(tenantConfig.app_secret);
      if (!verifyMetaSignature(rawBody, signature, tenantSecret)) {
        return NextResponse.json({ error: 'Firma de tenant inválida' }, { status: 401 });
      }
    }

    // Procesar estados de entrega (sent, delivered, read, failed)
    if (value?.statuses?.length > 0 && tenantConfig) {
      for (const st of value.statuses) {
        if (st.id && st.status) {
          await query(
            `UPDATE messages SET delivery_status = $1 WHERE tenant_id = $2 AND external_message_id = $3`,
            [st.status, tenantConfig.tenant_id, st.id]
          );
        }
      }
    }

    if (!value?.messages || value.messages.length === 0) {
      return NextResponse.json({ status: 'ignored_no_messages' });
    }

    if (!tenantConfig) {
      console.warn(`[WHATSAPP WEBHOOK] Mensaje recibido para Phone ID ${phoneNumberId} sin Tenant registrado.`);
      return NextResponse.json({ status: 'tenant_not_found' });
    }

    const tenantId = tenantConfig.tenant_id;
    const incomingMessage = value.messages[0];
    const externalMessageId = incomingMessage.id || null;
    const contactProfile = value.contacts?.[0];
    const senderNumber = incomingMessage.from;
    const contactName = contactProfile?.profile?.name || `Cliente ${senderNumber}`;

    // Idempotencia: evitar reprocesar un mismo wamid reenviado por Meta
    if (externalMessageId) {
      const dupCheck = await query(
        `SELECT id FROM messages WHERE tenant_id = $1 AND external_message_id = $2 LIMIT 1`,
        [tenantId, externalMessageId]
      );
      if (dupCheck.rowCount > 0) {
        return NextResponse.json({ status: 'duplicate_ignored', wamid: externalMessageId });
      }
    }

    // Extraer contenido del mensaje e ID de botón/lista interactiva
    let messageText = '';
    let messageType = incomingMessage.type || 'text';
    let mediaUrl = null;
    let interactiveId = null;

    if (messageType === 'text') {
      messageText = incomingMessage.text?.body || '';
    } else if (messageType === 'interactive') {
      const btn = incomingMessage.interactive?.button_reply;
      const list = incomingMessage.interactive?.list_reply;
      interactiveId = btn?.id || list?.id || null;
      messageText = btn?.title || list?.title || '[Interactivo]';
    } else if (messageType === 'button') {
      interactiveId = incomingMessage.button?.payload || null;
      messageText = incomingMessage.button?.text || '[Botón]';
    } else if (['image', 'video', 'audio', 'document'].includes(messageType)) {
      messageText = incomingMessage[messageType]?.caption || `[Multimedia: ${messageType}]`;
      mediaUrl = incomingMessage[messageType]?.id || null;
    }

    // 1. Upsert atómico de Contacto sin duplicados
    const contactRes = await query(
      `INSERT INTO contacts (tenant_id, name, phone, external_id, channel, last_interaction_at)
       VALUES ($1, $2, $3, $4, 'whatsapp', NOW())
       ON CONFLICT (tenant_id, channel, external_id)
       DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
         phone = COALESCE(NULLIF(EXCLUDED.phone, ''), contacts.phone),
         last_interaction_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [tenantId, contactName, senderNumber, senderNumber]
    );

    const contactId = contactRes.rows[0].id;

    // 2. Upsert de Conversación
    const convRes = await query(
      `INSERT INTO conversations (tenant_id, contact_id, channel, session_id, last_message_preview, last_message_at, unread_count)
       VALUES ($1, $2, 'whatsapp', $3, $4, NOW(), 1)
       ON CONFLICT (tenant_id, channel, session_id)
       DO UPDATE SET
         last_message_preview = EXCLUDED.last_message_preview,
         last_message_at = NOW(),
         unread_count = conversations.unread_count + 1,
         updated_at = NOW()
       RETURNING id, ai_enabled, status`,
      [tenantId, contactId, senderNumber, messageText]
    );

    const conversation = convRes.rows[0];

    // 3. Registrar Mensaje entrante con external_message_id (idempotente)
    await query(
      `INSERT INTO messages (tenant_id, conversation_id, sender_type, sender_id, content, message_type, media_url, external_message_id, delivery_status, payload)
       VALUES ($1, $2, 'contact', $3, $4, $5, $6, $7, 'received', $8)
       ON CONFLICT (tenant_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING`,
      [
        tenantId,
        conversation.id,
        senderNumber,
        messageText,
        messageType,
        mediaUrl,
        externalMessageId,
        JSON.stringify({ ...incomingMessage, interactiveId }),
      ]
    );

    // 4. Manejo directo de botones interactivos de recordatorios (Confirmar / Reprogramar)
    let aiOutcome = null;
    if (interactiveId && interactiveId.startsWith('confirm_apt:')) {
      const aptId = interactiveId.replace('confirm_apt:', '').trim();
      try {
        const confirmed = await updateAppointmentState({
          tenantId,
          appointmentId: aptId,
          status: 'confirmed',
        });
        await sendWhatsAppText({
          tenantId,
          toPhone: senderNumber,
          conversationId: conversation.id,
          text: `¡Perfecto, ${contactName}! Tu cita del ${confirmed.formattedStart} ha quedado confirmada. Te esperamos.`,
        });
        aiOutcome = { action: 'appointment_confirmed', appointmentId: aptId };
      } catch (err) {
        console.warn('[WHATSAPP CONFIRM BTN ERROR]:', err.message);
      }
    } else if (conversation.ai_enabled && tenantConfig.bot_enabled && messageText) {
      // 5. Ejecutar Agente IA Multitenant con memoria + triaje + Tool Calling
      try {
        const promptMessage =
          interactiveId && interactiveId.startsWith('reschedule_apt:')
            ? `Quiero reprogramar mi cita con ID ${interactiveId.replace('reschedule_apt:', '').trim()}. ¿Qué horarios disponibles tienes?`
            : messageText;

        aiOutcome = await runTenantAIAgent({
          tenantId,
          contactId,
          conversationId: conversation.id,
          userMessage: promptMessage,
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
        console.error('[WHATSAPP AI AGENT ERROR]:', aiErr.message);
        aiOutcome = { error: aiErr.message };
      }
    }

    return NextResponse.json({
      status: 'processed',
      tenant_id: tenantId,
      conversation_id: conversation.id,
      contact_id: contactId,
      interactive_id: interactiveId,
      ai_enabled: conversation.ai_enabled && tenantConfig.bot_enabled,
      ai: aiOutcome,
    });
  } catch (error) {
    console.error('[WHATSAPP WEBHOOK ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

