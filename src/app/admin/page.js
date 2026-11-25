import { query } from '@/lib/db';
import SpotlightCard from '@/components/ui/SpotlightCard';
import CountUp from '@/components/ui/CountUp';
import { Building2, CalendarCheck2, MessageCircle, Cpu, Clock } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const [tenantsRes, msgRes, aptRes, jobsRes, recentTenants] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active FROM tenants`),
    query(`SELECT COUNT(*)::int AS total FROM messages`),
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed'))::int AS active FROM appointments`),
    query(`SELECT COUNT(*)::int AS pending FROM automation_jobs WHERE status = 'pending'`),
    query(`
      SELECT t.id, t.name, t.slug, t.industry, t.status, t.enabled_modules,
             ai.provider AS ai_provider, g.status AS google_status
      FROM tenants t
      LEFT JOIN tenant_ai_configs ai ON ai.tenant_id = t.id
      LEFT JOIN tenant_google_integrations g ON g.tenant_id = t.id
      ORDER BY t.created_at DESC
      LIMIT 6
    `),
  ]);

  const stats = [
    {
      label: 'Tenants Activos',
      value: tenantsRes.rows[0]?.active || 0,
      sub: `${tenantsRes.rows[0]?.total || 0} registrados en total`,
      color: '#6366F1',
      icon: Building2,
    },
    {
      label: 'Citas Activas',
      value: aptRes.rows[0]?.active || 0,
      sub: `${aptRes.rows[0]?.total || 0} históricas`,
      color: '#22D3EE',
      icon: CalendarCheck2,
    },
    {
      label: 'Mensajes Omnicanal',
      value: msgRes.rows[0]?.total || 0,
      sub: 'WhatsApp & Instagram aislados',
      color: '#10B981',
      icon: MessageCircle,
    },
    {
      label: 'Jobs en Cola Worker',
      value: jobsRes.rows[0]?.pending || 0,
      sub: 'Recordatorios 24h/2h & seguimientos',
      color: '#F59E0B',
      icon: Clock,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            Consola Partner Admin
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Estado en vivo de la infraestructura multitenant en Docker, motores IA y cola de automatizaciones.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Link href={process.env.NEXT_PUBLIC_CLIENT_URL ? `${process.env.NEXT_PUBLIC_CLIENT_URL}/dashboard` : "https://client.munirix.net/dashboard"} className="hc-btn">
            Ver Workspace Demo
          </Link>
          <Link href="/admin/clients" className="hc-btn hc-btn-primary">
            Gestionar Tenants
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <SpotlightCard
              key={item.label}
              spotlightColor={item.color}
              intensity={0.16}
              borderGlow={0.55}
              style={{ padding: '1.35rem', borderRadius: '16px', backgroundColor: '#111520' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {item.label}
                </span>
                <Icon size={18} color={item.color} />
              </div>
              <div className="tabular" style={{ fontSize: '2.1rem', fontWeight: 700, lineHeight: 1.1 }}>
                <CountUp to={item.value} duration={0.9} trigger="load" />
              </div>
              <p style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {item.sub}
              </p>
            </SpotlightCard>
          );
        })}
      </div>

      <SpotlightCard
        spotlightColor="#6366F1"
        intensity={0.12}
        borderGlow={0.45}
        style={{ padding: '1.5rem', borderRadius: '16px', backgroundColor: '#111520' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Organizaciones Recientes</h2>
          <span className="hc-pill hc-pill-indigo">
            <Cpu size={13} /> Backend LLM: Gemini & DeepSeek
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 0.6rem' }}>Organización</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Vertical</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Proveedor IA</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Google Sync</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Módulos</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {recentTenants.rows.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.85rem 0.6rem', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: '0.85rem 0.6rem' }}>
                    <span className="hc-pill hc-pill-cyan">{t.industry || 'general'}</span>
                  </td>
                  <td style={{ padding: '0.85rem 0.6rem' }}>{t.ai_provider || 'gemini'}</td>
                  <td style={{ padding: '0.85rem 0.6rem' }}>
                    <span className={`hc-pill ${t.google_status === 'connected' ? 'hc-pill-emerald' : ''}`}>
                      {t.google_status === 'connected' ? 'Conectado' : 'Pendiente'}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 0.6rem' }}>
                    {Array.isArray(t.enabled_modules) ? t.enabled_modules.length : 0} activos
                  </td>
                  <td style={{ padding: '0.85rem 0.6rem' }}>
                    <span className={`hc-pill ${t.status === 'active' ? 'hc-pill-emerald' : 'hc-pill-coral'}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SpotlightCard>
    </div>
  );
}


