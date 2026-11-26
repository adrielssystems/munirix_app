'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Save, XCircle, RefreshCw } from 'lucide-react';
import styles from '../admin.module.css';

export default function PaymentsManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({ certifiedUsd: 0, pendingCount: 0, pendingUsd: 0 });
  const [accounts, setAccounts] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/payments', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setPayments(data.payments || []);
        setStats(data.stats || { certifiedUsd: 0, pendingCount: 0, pendingUsd: 0 });
        setAccounts(data.accounts || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAction = async (paymentId, action) => {
    let adminNotes = '';
    if (action === 'reject') {
      adminNotes = window.prompt('Motivo del rechazo (opcional):', 'Referencia no encontrada') || '';
    }
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, action, adminNotes }),
      });
      if (res.ok) {
        setNotice(
          action === 'certify'
            ? 'Pago certificado y espacio del cliente activado.'
            : 'Pago marcado como rechazado.'
        );
        await loadData();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccounts = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (res.ok) {
        setNotice('Cuentas de cobro actualizadas en vivo para la pasarela de clientes.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.glassPanel}>Cargando pagos y cuentas de cobro...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className={styles.pageHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Certificación de Pagos & Cuentas</h1>
          <p>Verifica los comprobantes de PayPal, Binance, Zelle y Pago Móvil para activar cada espacio.</p>
        </div>
        <button
          type="button"
          className={styles.actionButton}
          style={{ width: 'auto', padding: '0.55rem 1rem', borderRadius: '10px' }}
          onClick={loadData}
        >
          <RefreshCw size={16} style={{ marginRight: '0.45rem' }} /> Actualizar
        </button>
      </div>

      {notice && (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.14)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#a7f3d0',
            fontSize: '0.88rem',
          }}
        >
          {notice}
        </div>
      )}

      <div className={styles.gridCards}>
        <div className={styles.glassPanel}>
          <div className={styles.cardHeader}>
            <h3>Ingresos Certificados</h3>
          </div>
          <p className={styles.cardValue}>${stats.certifiedUsd.toFixed(2)}</p>
          <p className={styles.cardSubtext}>Pagos validados</p>
        </div>
        <div className={styles.glassPanel}>
          <div className={styles.cardHeader}>
            <h3>Por Certificar</h3>
          </div>
          <p className={styles.cardValue}>${stats.pendingUsd.toFixed(2)}</p>
          <p className={styles.cardSubtext}>{stats.pendingCount} reportes pendientes</p>
        </div>
      </div>

      <div className={styles.glassPanel}>
        <h2 style={{ fontSize: '1.08rem', marginBottom: '1rem' }}>Comprobantes Reportados</h2>
        <div className={styles.tableContainer}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Cliente / Espacio</th>
                <th>Plan</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Referencia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                    Aún no hay pagos reportados.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.tenant_name}</strong>
                      <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>{p.user_email}</div>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{p.plan_code}</td>
                    <td><strong>${Number(p.amount_usd).toFixed(2)}</strong></td>
                    <td style={{ textTransform: 'uppercase', fontSize: '0.78rem' }}>{p.payment_method}</td>
                    <td>
                      <code>{p.reference_code}</code>
                      {p.payer_details?.holderName && (
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                          {p.payer_details.holderName} {p.payer_details.bank ? `· ${p.payer_details.bank}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          p.status === 'certified'
                            ? styles.badgeActive
                            : p.status === 'rejected'
                            ? styles.badgeInactive
                            : ''
                        }`}
                        style={
                          p.status === 'pending'
                            ? {
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                              }
                            : undefined
                        }
                      >
                        {p.status === 'certified'
                          ? 'Certificado'
                          : p.status === 'rejected'
                          ? 'Rechazado'
                          : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      {p.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleAction(p.id, 'certify')}
                            style={{
                              padding: '0.35rem 0.7rem',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#10b981',
                              color: '#04120a',
                              fontWeight: 700,
                              fontSize: '0.76rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <CheckCircle2 size={14} /> Certificar y Activar
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleAction(p.id, 'reject')}
                            style={{
                              padding: '0.35rem 0.6rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(244,63,94,0.4)',
                              background: 'transparent',
                              color: '#fda4af',
                              fontSize: '0.76rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <XCircle size={14} /> Rechazar
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Procesado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {accounts && (
        <form onSubmit={handleSaveAccounts} className={styles.glassPanel} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.08rem' }}>Cuentas Receptoras en Pasarela de Clientes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>PayPal Email</label>
              <input
                className="hc-input"
                value={accounts.paypal?.email || ''}
                onChange={(e) => setAccounts({ ...accounts, paypal: { ...accounts.paypal, email: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>PayPal.me URL</label>
              <input
                className="hc-input"
                value={accounts.paypal?.checkout_url || ''}
                onChange={(e) => setAccounts({ ...accounts, paypal: { ...accounts.paypal, checkout_url: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Binance Pay ID</label>
              <input
                className="hc-input"
                value={accounts.binance?.binance_id || ''}
                onChange={(e) => setAccounts({ ...accounts, binance: { ...accounts.binance, binance_id: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Correo Binance</label>
              <input
                className="hc-input"
                value={accounts.binance?.email || ''}
                onChange={(e) => setAccounts({ ...accounts, binance: { ...accounts.binance, email: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Zelle Correo / Teléfono</label>
              <input
                className="hc-input"
                value={accounts.zelle?.email || ''}
                onChange={(e) => setAccounts({ ...accounts, zelle: { ...accounts.zelle, email: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Zelle Titular</label>
              <input
                className="hc-input"
                value={accounts.zelle?.holder || ''}
                onChange={(e) => setAccounts({ ...accounts, zelle: { ...accounts.zelle, holder: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Pago Móvil - Banco</label>
              <input
                className="hc-input"
                value={accounts.pago_movil?.bank || ''}
                onChange={(e) => setAccounts({ ...accounts, pago_movil: { ...accounts.pago_movil, bank: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Pago Móvil - Cédula / RIF</label>
              <input
                className="hc-input"
                value={accounts.pago_movil?.document || ''}
                onChange={(e) => setAccounts({ ...accounts, pago_movil: { ...accounts.pago_movil, document: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Pago Móvil - Teléfono</label>
              <input
                className="hc-input"
                value={accounts.pago_movil?.phone || ''}
                onChange={(e) => setAccounts({ ...accounts, pago_movil: { ...accounts.pago_movil, phone: e.target.value } })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.25rem' }}>WhatsApp Soporte Pagos</label>
              <input
                className="hc-input"
                value={accounts.whatsapp_support || ''}
                onChange={(e) => setAccounts({ ...accounts, whatsapp_support: e.target.value })}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              alignSelf: 'flex-start',
              padding: '0.6rem 1.25rem',
              borderRadius: '10px',
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Save size={15} /> Guardar Cuentas de Cobro
          </button>
        </form>
      )}
    </div>
  );
}
