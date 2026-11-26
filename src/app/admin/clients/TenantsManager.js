'use client';

import { useState } from 'react';
import {
  Plus,
  Trash2,
  Sliders,
  CheckCircle2,
  XCircle,
  Sparkles,
  Calendar,
  X,
} from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';
import SquishSwitch from '@/components/ui/SquishSwitch';
import MunirixTopToast from '@/components/ui/MunirixTopToast';
import { MODULE_CATALOG, INDUSTRY_PRESETS, normalizeModules } from '@/lib/modules';

const TIMEZONES = [
  'America/Caracas',
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'Europe/Madrid',
];

export default function TenantsManager({ initialTenants }) {
  const [tenants, setTenants] = useState(initialTenants || []);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [form, setForm] = useState({
    name: '',
    slug: '',
    industry: 'dermatology',
    timezone: 'America/Caracas',
    ai_provider: 'gemini',
    ai_model: 'gemini-2.5-flash',
    enabled_modules: INDUSTRY_PRESETS.dermatology.defaultModules,
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  const refreshTenants = async () => {
    const res = await fetch('/api/admin/tenants', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setTenants(data.tenants || []);
    }
  };

  const handleIndustryChange = (industry) => {
    const preset = INDUSTRY_PRESETS[industry] || INDUSTRY_PRESETS.general;
    setForm((prev) => ({
      ...prev,
      industry,
      enabled_modules: preset.defaultModules,
    }));
  };

  const toggleFormModule = (key) => {
    setForm((prev) => {
      const exists = prev.enabled_modules.includes(key);
      return {
        ...prev,
        enabled_modules: exists
          ? prev.enabled_modules.filter((m) => m !== key)
          : [...prev.enabled_modules, key],
      };
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback('');
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || 'Error creando organización');
      } else {
        setShowCreate(false);
        setForm({
          name: '',
          slug: '',
          industry: 'dermatology',
          timezone: 'America/Caracas',
          ai_provider: 'gemini',
          ai_model: 'gemini-2.5-flash',
          enabled_modules: INDUSTRY_PRESETS.dermatology.defaultModules,
          adminName: '',
          adminEmail: '',
          adminPassword: '',
        });
        await refreshTenants();
        setFeedback('Organización creada con sus módulos y configuración base.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleModuleForTenant = async (tenant, moduleKey, checked) => {
    const current = normalizeModules(tenant.enabled_modules);
    const next = checked
      ? Array.from(new Set([...current, moduleKey]))
      : current.filter((m) => m !== moduleKey);

    setTenants((prev) =>
      prev.map((t) => (t.id === tenant.id ? { ...t, enabled_modules: next } : t))
    );
    if (editingTenant?.id === tenant.id) {
      setEditingTenant((prev) => ({ ...prev, enabled_modules: next }));
    }

    await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_modules: next }),
    });
  };

  const handleToggleStatus = async (tenant) => {
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      await refreshTenants();
    }
  };

  const handleDelete = (tenant) => {
    setConfirmDialog({
      tone: 'danger',
      title: `Eliminar "${tenant.name}"`,
      message: 'Se eliminarán permanentemente todos sus datos aislados en PostgreSQL y su instancia en Evolution API.',
      confirmLabel: 'Sí, eliminar todo',
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/admin/tenants/${tenant.id}`, { method: 'DELETE' });
        if (res.ok) {
          if (editingTenant?.id === tenant.id) setEditingTenant(null);
          await refreshTenants();
          setToast({ type: 'success', message: `Espacio "${tenant.name}" e instancia eliminados correctamente.` });
        } else {
          setToast({ type: 'error', message: 'No se pudo eliminar el cliente.' });
        }
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <MunirixTopToast
        toast={toast}
        onCloseToast={() => setToast(null)}
        confirmDialog={confirmDialog}
        onCancelConfirm={() => setConfirmDialog(null)}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            Clientes & Feature Flags
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Administra organizaciones, verticales activas y módulos por cliente en tiempo real.
          </p>
        </div>

        <button
          type="button"
          className="hc-btn hc-btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={17} />
          <span>Nuevo Tenant</span>
        </button>
      </div>

      {feedback && (
        <div
          style={{
            padding: '0.8rem 1rem',
            borderRadius: '12px',
            background: 'rgba(99, 102, 241, 0.14)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            color: '#c7d2fe',
            fontSize: '0.875rem',
          }}
        >
          {feedback}
        </div>
      )}

      {showCreate && (
        <SpotlightCard
          spotlightColor="#6366F1"
          intensity={0.14}
          borderGlow={0.55}
          style={{ padding: '1.65rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Crear Organización (Tenant)</h2>
            <button type="button" className="hc-btn" onClick={() => setShowCreate(false)}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Nombre del Consultorio / Empresa *
              </label>
              <input
                className="hc-input"
                required
                placeholder="Ej. Dra. Sofía Méndez Dermatología"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Slug (opcional, se genera automático)
              </label>
              <input
                className="hc-input"
                placeholder="dra-sofia-derma"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Vertical / Industria
              </label>
              <select
                className="hc-select"
                value={form.industry}
                onChange={(e) => handleIndustryChange(e.target.value)}
              >
                {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Zona Horaria
              </label>
              <select
                className="hc-select"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Proveedor LLM Inicial
              </label>
              <select
                className="hc-select"
                value={form.ai_provider}
                onChange={(e) => {
                  const provider = e.target.value;
                  const modelMap = {
                    gemini: 'gemini-2.5-flash',
                    deepseek: 'deepseek-chat',
                    openai: 'gpt-4o-mini',
                    anthropic: 'claude-3-5-haiku-latest',
                  };
                  setForm({ ...form, ai_provider: provider, ai_model: modelMap[provider] });
                }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Correo Admin del Tenant (opcional)
              </label>
              <input
                className="hc-input"
                type="email"
                placeholder="doctora@clinica.com"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Nombre Admin del Tenant
              </label>
              <input
                className="hc-input"
                placeholder="Dra. Sofía Méndez"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Contraseña Inicial
              </label>
              <input
                className="hc-input"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                Módulos Activables (`enabled_modules`)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                {MODULE_CATALOG.map((mod) => {
                  const active = form.enabled_modules.includes(mod.key);
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => toggleFormModule(mod.key)}
                      className={`hc-pill ${active ? 'hc-pill-indigo' : ''}`}
                      style={{ cursor: 'pointer', padding: '0.4rem 0.85rem' }}
                    >
                      <span>{mod.label}</span>
                      {mod.phase > 1 && <span style={{ opacity: 0.65 }}>F{mod.phase}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="hc-btn" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button type="submit" className="hc-btn hc-btn-primary" disabled={saving}>
                {saving ? 'Creando...' : 'Crear Tenant y Sembrar Servicios'}
              </button>
            </div>
          </form>
        </SpotlightCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.15rem' }}>
        {tenants.map((tenant) => {
          const modules = normalizeModules(tenant.enabled_modules);
          const preset = INDUSTRY_PRESETS[tenant.industry] || INDUSTRY_PRESETS.general;
          return (
            <SpotlightCard
              key={tenant.id}
              spotlightColor={tenant.status === 'active' ? '#6366F1' : '#FB7185'}
              intensity={0.14}
              borderGlow={0.5}
              style={{ padding: '1.4rem', borderRadius: '16px', backgroundColor: '#111520' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{tenant.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                    <span className="hc-pill">{tenant.slug}</span>
                    <span className="hc-pill hc-pill-cyan">{preset.label}</span>
                  </div>
                </div>
                <span className={`hc-pill ${tenant.status === 'active' ? 'hc-pill-emerald' : 'hc-pill-coral'}`}>
                  {tenant.status === 'active' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {tenant.status === 'active' ? 'Activo' : 'Suspendido'}
                </span>
              </div>

              <div
                className="tabular"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.6rem',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  background: 'rgba(7,8,10,0.65)',
                  border: '1px solid var(--border-hairline)',
                  marginBottom: '0.9rem',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Usuarios</div>
                  <strong style={{ fontSize: '1rem' }}>{tenant.users_count ?? 0}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Contactos</div>
                  <strong style={{ fontSize: '1rem' }}>{tenant.contacts_count ?? 0}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Citas</div>
                  <strong style={{ fontSize: '1rem' }}>{tenant.appointments_count ?? 0}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                <span className="hc-pill hc-pill-indigo">
                  <Sparkles size={12} /> {tenant.ai_provider || 'gemini'} / {tenant.ai_model || 'gemini-2.5-flash'}
                </span>
                <span className={`hc-pill ${tenant.google_status === 'connected' ? 'hc-pill-emerald' : ''}`}>
                  <Calendar size={12} /> {tenant.google_status === 'connected' ? 'Google Sync' : 'Sin Google'}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                {modules.map((m) => (
                  <span key={m} className="hc-pill" style={{ fontSize: '0.72rem' }}>
                    {MODULE_CATALOG.find((c) => c.key === m)?.shortLabel || m}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border-hairline)', paddingTop: '0.85rem' }}>
                <button
                  type="button"
                  className="hc-btn"
                  style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => setEditingTenant(editingTenant?.id === tenant.id ? null : tenant)}
                >
                  <Sliders size={14} />
                  <span>Módulos</span>
                </button>
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <button
                    type="button"
                    className="hc-btn"
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={() => handleToggleStatus(tenant)}
                  >
                    {tenant.status === 'active' ? 'Suspender' : 'Reactivar'}
                  </button>
                  <button
                    type="button"
                    className="hc-btn hc-btn-danger"
                    style={{ padding: '0.45rem 0.65rem' }}
                    onClick={() => handleDelete(tenant)}
                    title="Eliminar Tenant"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </SpotlightCard>
          );
        })}
      </div>

      {editingTenant && (
        <SpotlightCard
          spotlightColor="#22D3EE"
          intensity={0.14}
          borderGlow={0.6}
          style={{ padding: '1.65rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                Feature Flags — {editingTenant.name}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Los cambios se guardan inmediatamente y actualizan el menú y permisos API del tenant.
              </p>
            </div>
            <button type="button" className="hc-btn" onClick={() => setEditingTenant(null)}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.9rem' }}>
            {MODULE_CATALOG.map((mod) => {
              const checked = normalizeModules(editingTenant.enabled_modules).includes(mod.key);
              return (
                <div
                  key={mod.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.95rem 1rem',
                    borderRadius: '12px',
                    background: 'rgba(7,8,10,0.7)',
                    border: '1px solid var(--border-hairline)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9rem' }}>{mod.label}</strong>
                      {mod.comingSoon && <span className="hc-pill hc-pill-amber">Fase {mod.phase}</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.25rem', lineHeight: 1.4 }}>
                      {mod.description}
                    </p>
                  </div>
                  <SquishSwitch
                    checked={checked}
                    onChange={(next) => handleToggleModuleForTenant(editingTenant, mod.key, next)}
                    width={52}
                    height={28}
                    radius={14}
                    trackColor="#232836"
                    trackOnColor={mod.accent}
                    thumbColor="#94a3b8"
                    thumbOnColor="#07080a"
                    ariaLabel={`Activar ${mod.label}`}
                  />
                </div>
              );
            })}
          </div>
        </SpotlightCard>
      )}
    </div>
  );
}

