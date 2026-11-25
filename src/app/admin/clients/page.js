import { query } from '@/lib/db';
import TenantsManager from './TenantsManager';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const res = await query(`
    SELECT
      t.id, t.name, t.slug, t.status, t.industry, t.timezone,
      t.enabled_modules, t.branding, t.created_at,
      ai.provider AS ai_provider, ai.model AS ai_model,
      g.status AS google_status, g.google_email,
      (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count,
      (SELECT COUNT(*)::int FROM contacts c WHERE c.tenant_id = t.id) AS contacts_count,
      (SELECT COUNT(*)::int FROM appointments a WHERE a.tenant_id = t.id) AS appointments_count
    FROM tenants t
    LEFT JOIN tenant_ai_configs ai ON ai.tenant_id = t.id
    LEFT JOIN tenant_google_integrations g ON g.tenant_id = t.id
    ORDER BY t.created_at DESC
  `);

  return <TenantsManager initialTenants={res.rows} />;
}

