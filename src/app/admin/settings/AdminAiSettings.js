'use client';

import { useState } from 'react';
import { Bot, CheckCircle2, AlertTriangle, Save, ShieldCheck } from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';

export default function AdminAiSettings({ initialDefaults, envStatus }) {
  const [defaults, setDefaults] = useState(initialDefaults);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      });
      if (res.ok) {
        setSavedMsg('Configuración global de Gemini y DeepSeek guardada.');
      }
    } finally {
      setSaving(false);
    }
  };

  const envChecks = [
    { label: 'GEMINI_API_KEY (Google Gemini Backend)', ok: envStatus.gemini },
    { label: 'DEEPSEEK_API_KEY (DeepSeek Backend)', ok: envStatus.deepseek },
    { label: 'GOOGLE_CLIENT_ID / SECRET (OAuth Workspace)', ok: envStatus.googleOAuth },
    { label: 'META_APP_SECRET (Firma HMAC Webhooks)', ok: envStatus.metaAppSecret },
    { label: 'ENCRYPTION_KEY (AES-256-GCM dedicado)', ok: envStatus.encryptionKey },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
          Configuración de Plataforma (Admin & Backend)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
          Define los motores por defecto (Gemini & DeepSeek) y verifica las variables de entorno de producción.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        <SpotlightCard
          spotlightColor="#6366F1"
          intensity={0.14}
          borderGlow={0.55}
          style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
            <Bot size={20} color="#818cf8" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Motores LLM Admin & Fallback</h2>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Proveedor Principal Backend/Admin
              </label>
              <select
                className="hc-select"
                value={defaults.admin_provider}
                onChange={(e) =>
                  setDefaults({
                    ...defaults,
                    admin_provider: e.target.value,
                    admin_model: e.target.value === 'deepseek' ? 'deepseek-chat' : 'gemini-2.5-flash',
                  })
                }
              >
                <option value="gemini">Google Gemini</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Modelo Principal
              </label>
              <input
                className="hc-input"
                value={defaults.admin_model}
                onChange={(e) => setDefaults({ ...defaults, admin_model: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Proveedor Respaldo (Fallback)
              </label>
              <select
                className="hc-select"
                value={defaults.fallback_provider}
                onChange={(e) =>
                  setDefaults({
                    ...defaults,
                    fallback_provider: e.target.value,
                    fallback_model: e.target.value === 'gemini' ? 'gemini-2.5-flash' : 'deepseek-chat',
                  })
                }
              >
                <option value="deepseek">DeepSeek</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Modelo Respaldo
              </label>
              <input
                className="hc-input"
                value={defaults.fallback_model}
                onChange={(e) => setDefaults({ ...defaults, fallback_model: e.target.value })}
              />
            </div>

            {savedMsg && (
              <div className="hc-pill hc-pill-emerald" style={{ padding: '0.5rem 0.8rem' }}>
                {savedMsg}
              </div>
            )}

            <button type="submit" className="hc-btn hc-btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </form>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="#22D3EE"
          intensity={0.14}
          borderGlow={0.55}
          style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
            <ShieldCheck size={20} color="#22d3ee" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Estado de Secretos & Entorno</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {envChecks.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  background: 'rgba(7,8,10,0.68)',
                  border: '1px solid var(--border-hairline)',
                  fontSize: '0.84rem',
                }}
              >
                <span>{item.label}</span>
                {item.ok ? (
                  <span className="hc-pill hc-pill-emerald">
                    <CheckCircle2 size={13} /> Configurada
                  </span>
                ) : (
                  <span className="hc-pill hc-pill-amber">
                    <AlertTriangle size={13} /> Pendiente
                  </span>
                )}
              </div>
            ))}
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}

