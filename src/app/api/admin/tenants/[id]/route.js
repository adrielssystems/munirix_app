import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadmin } from '@/lib/auth';
import { normalizeModules } from '@/lib/modules';
import { decryptSecret } from '@/lib/crypto';
import { deleteEvolutionInstance } from '@/lib/meta/evolution';

export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const fields = [];
    const values = [];
    let idx = 1;

    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(String(body.name).trim());
    }
    if (body.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(body.status === 'suspended' ? 'suspended' : 'active');
    }
    if (body.industry !== undefined) {
      fields.push(`industry = $${idx++}`);
      values.push(String(body.industry));
    }
    if (body.timezone !== undefined) {
      fields.push(`timezone = $${idx++}`);
      values.push(String(body.timezone));
    }
    if (body.enabled_modules !== undefined) {
      fields.push(`enabled_modules = $${idx++}::jsonb`);
      values.push(JSON.stringify(normalizeModules(body.enabled_modules)));
    }
    if (body.branding !== undefined) {
      fields.push(`branding = $${idx++}::jsonb`);
      values.push(JSON.stringify(body.branding));
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No se enviaron campos para actualizar.' }, { status: 400 });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const res = await query(
      `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Tenant no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ tenant: res.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;

    // 1. Obtener configuración de Evolution API antes de eliminar el tenant
    const metaRes = await query(
      `SELECT evolution_api_url, evolution_instance, evolution_api_key_encrypted
       FROM tenant_meta_configs
       WHERE tenant_id = $1 AND channel = 'whatsapp'
       LIMIT 1`,
      [id]
    );
    const meta = metaRes.rows[0];
    let evolutionDeleted = false;

    if (meta?.evolution_instance && meta.evolution_instance !== 'AdrielsSystems') {
      const apiUrl = meta.evolution_api_url || process.env.EVOLUTION_API_URL || '';
      const apiKey = decryptSecret(meta.evolution_api_key_encrypted) || process.env.EVOLUTION_API_KEY || '';
      if (apiUrl && apiKey) {
        try {
          await deleteEvolutionInstance({
            apiUrl,
            apiKey,
            instance: meta.evolution_instance,
          });
          evolutionDeleted = true;
        } catch (evoErr) {
          console.warn('[ADMIN DELETE TENANT] Aviso borrando instancia Evolution:', evoErr.message);
        }
      }
    }

    // 2. Eliminar tenant en PostgreSQL (ON DELETE CASCADE borra usuarios, chats, citas, pagos, configs)
    const res = await query(`DELETE FROM tenants WHERE id = $1 RETURNING id`, [id]);
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Tenant no encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id, evolutionDeleted });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
