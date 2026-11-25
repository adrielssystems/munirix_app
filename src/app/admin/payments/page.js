import styles from "../admin.module.css";
import { DollarSign, Download, Filter } from "lucide-react";

export default function AdminPaymentsPage() {
  // Mock data for simulated payments view
  const payments = [
    { id: 'INV-2026-001', tenant: 'Munirix Demo', plan: 'Pro', amount: '$49.00', status: 'paid', date: '2026-09-01' },
    { id: 'INV-2026-002', tenant: 'Inmobiliaria Sur', plan: 'Enterprise', amount: '$199.00', status: 'pending', date: '2026-09-15' },
    { id: 'INV-2026-003', tenant: 'Ventas Plus', plan: 'Starter', amount: '$29.00', status: 'overdue', date: '2026-08-30' },
  ];

  return (
    <>
      <div className={styles.pageHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Control de Pagos</h1>
          <p>Gestión de suscripciones, fechas de corte y facturación de Tenants.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={styles.actionButton} style={{ width: 'auto', padding: '0 1rem', borderRadius: '8px', background: 'transparent' }}>
            <Filter size={18} style={{ marginRight: '0.5rem' }} /> Filtrar
          </button>
          <button className={styles.actionButton} style={{ width: 'auto', padding: '0 1.5rem', borderRadius: '8px', background: '#10b981', color: 'white', border: 'none' }}>
            <DollarSign size={18} style={{ marginRight: '0.5rem' }} /> Registrar Pago
          </button>
        </div>
      </div>

      <div className={styles.gridCards}>
        <div className={styles.glassPanel}>
          <div className={styles.cardHeader}>
            <h3>Ingresos (Mes Actual)</h3>
          </div>
          <p className={styles.cardValue}>$1,249.00</p>
          <p className={styles.cardSubtext}>+15% vs mes anterior</p>
        </div>
        <div className={styles.glassPanel}>
          <div className={styles.cardHeader}>
            <h3>Pagos Pendientes</h3>
          </div>
          <p className={styles.cardValue}>$348.00</p>
          <p className={styles.cardSubtext}>3 facturas por cobrar</p>
        </div>
      </div>

      <div className={styles.glassPanel}>
        <div className={styles.tableContainer}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Monto</th>
                <th>Fecha de Emisión</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(payment => (
                <tr key={payment.id}>
                  <td><strong>{payment.id}</strong></td>
                  <td>{payment.tenant}</td>
                  <td>{payment.plan}</td>
                  <td>{payment.amount}</td>
                  <td>{new Date(payment.date).toLocaleDateString()}</td>
                  <td>
                    <span className={`${styles.badge} ${
                      payment.status === 'paid' ? styles.badgeActive : 
                      payment.status === 'pending' ? '' : styles.badgeInactive
                    }`} style={payment.status === 'pending' ? { background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)' } : {}}>
                      {payment.status === 'paid' ? 'Pagado' : payment.status === 'pending' ? 'Pendiente' : 'Vencido'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionRow}>
                      <button className={styles.iconBtn} title="Descargar Factura">
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

