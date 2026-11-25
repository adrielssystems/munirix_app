import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '@/lib/db';
import { requireSuperadmin } from '@/lib/auth';
import { INDUSTRY_PRESETS, normalizeModules } from '@/lib/modules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const res = await query(`
    SELECT
      t.id, t.name, t.slug, t.status, t.industry, t.timezone,
      t.enabled_modules, t.branding, t.created_at, t.updated_at,
      ai.provider AS ai_provider, ai.model AS ai_model, ai.enabled AS ai_enabled,
      g.status AS google_status, g.google_email,
      (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count,
      (SELECT COUNT(*)::int FROM contacts c WHERE c.tenant_id = t.id) AS contacts_count,
      (SELECT COUNT(*)::int FROM appointments a WHERE a.tenant_id = t.id) AS appointments_count
    FROM tenants t
    LEFT JOIN tenant_ai_configs ai ON ai.tenant_id = t.id
    LEFT JOIN tenant_google_integrations g ON g.tenant_id = t.id
    ORDER BY t.created_at DESC
  `);

  return NextResponse.json({ tenants: res.rows });
}

export async function POST(req) {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const rawSlug = String(body.slug || name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const industry = String(body.industry || 'dermatology');
    const timezone = String(body.timezone || 'America/Caracas');
    const preset = INDUSTRY_PRESETS[industry] || INDUSTRY_PRESETS.general;
    const enabledModules = normalizeModules(
      Array.isArray(body.enabled_modules) ? body.enabled_modules : preset.defaultModules
    );
    const aiProvider = String(body.ai_provider || 'gemini');
    const aiModel = String(
      body.ai_model || (aiProvider === 'deepseek' ? 'deepseek-chat' : 'gemini-2.5-flash')
    );

    if (!name || !rawSlug) {
      return NextResponse.json({ error: 'Nombre y slug son obligatorios.' }, { status: 400 });
    }

    const created = await withTransaction(async (client) => {
      const tenantRes = await client.query(
        `INSERT INTO tenants (name, slug, status, industry, timezone, enabled_modules)
         VALUES ($1, $2, 'active', $3, $4, $5::jsonb)
         RETURNING *`,
        [name, rawSlug, industry, timezone, JSON.stringify(enabledModules)]
      );
      const tenant = tenantRes.rows[0];

      // Configuración IA inicial independiente por tenant
      const defaultPrompt =
        industry === 'dermatology'
          ? `Eres la asistente virtual de agendamiento de ${name}. Respondes dudas frecuentes (horarios, ubicación, precios, seguros, preparación previa) y gestionas citas. Antes de confirmar una cita, pregunta el motivo de consulta (ej. acné, revisión de lunares, botox, caída del cabello) para seleccionar el servicio y duración adecuados.`
          : `Eres el asistente virtual de ${name}. Ayudas a clientes con información general y gestionas reservas, reprogramaciones y cancelaciones en la agenda.`;

      await client.query(
        `INSERT INTO tenant_ai_configs (tenant_id, provider, model, system_prompt)
         VALUES ($1, $2, $3, $4)`,
        [tenant.id, aiProvider, aiModel, defaultPrompt]
      );

      // Horario base Lunes a Viernes 08:30 - 17:30
      for (let d = 1; d <= 5; d++) {
        await client.query(
          `INSERT INTO availability_rules (tenant_id, day_of_week, start_time, end_time, is_active)
           VALUES ($1, $2, '08:30', '17:30', true)`,
          [tenant.id, d]
        );
      }

      // Seed de servicios base según vertical
      if (industry === 'dermatology') {
        const dermServices = [
          ['Consulta Dermatológica / Acné', 'derm-acne', 'Evaluación clínica de piel, acné o dermatitis.', 30, 10, 60, '#6366F1', 'Acudir sin maquillaje y traer lista de productos actuales.', ['acne', 'acné', 'piel', 'manchas', 'consulta'], 30],
          ['Revisión de Lunares', 'derm-lunares', 'Dermatoscopía y evaluación de lesiones pigmentadas.', 40, 10, 75, '#22D3EE', 'Evitar cremas con color 24h antes.', ['lunar', 'lunares', 'dermatoscopia', 'verruga'], 30],
          ['Aplicación de Botox', 'derm-botox', 'Evaluación facial y toxina botulínica.', 45, 15, 220, '#EC4899', 'Evitar antiinflamatorios o alcohol 24h antes.', ['botox', 'toxina', 'arrugas', 'estetica'], 15],
          ['Caída del Cabello (Tricología)', 'derm-cabello', 'Diagnóstico capilar integral.', 40, 10, 70, '#10B981', 'No lavar el cabello el día de la consulta.', ['cabello', 'pelo', 'caida', 'alopecia'], 30],
        ];
        for (const s of dermServices) {
          await client.query(
            `INSERT INTO services (tenant_id, name, code, description, duration_minutes, buffer_minutes, price, color, preparation_notes, triage_keywords, follow_up_days)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [tenant.id, ...s]
          );
        }
      } else {
        await client.query(
          `INSERT INTO services (tenant_id, name, code, description, duration_minutes, buffer_minutes, price, color, triage_keywords, follow_up_days)
           VALUES ($1, 'Asesoría / Consulta General', 'general', 'Sesión estándar de atención.', 30, 10, 50, '#6366F1', ARRAY['consulta','cita','asesoria'], 30)`,
          [tenant.id]
        );
      }

      // Usuario administrador inicial opcional
      if (body.adminEmail && body.adminPassword) {
        const passwordHash = await bcrypt.hash(String(body.adminPassword), 10);
        await client.query(
          `INSERT INTO users (tenant_id, name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, 'admin')`,
          [
            tenant.id,
            String(body.adminName || `Admin ${name}`).trim(),
            String(body.adminEmail).toLowerCase().trim(),
            passwordHash,
          ]
        );
      }

      return tenant;
    });

    return NextResponse.json({ tenant: created }, { status: 201 });
  } catch (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un tenant con ese slug o un usuario con ese correo.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

