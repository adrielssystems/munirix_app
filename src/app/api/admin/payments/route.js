import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireSuperadmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_BILLING_ACCOUNTS = {
  paypal: {
    enabled: true,
    email: 'pagos@adrielssystems.com',
    checkout_url: 'https://paypal.me/adrielssystems',
    instructions: 'Envía el monto exacto en USD a nuestra cuenta PayPal y reporta el ID de transacción.',
  },
  binance: {
    enabled: true,
    binance_id: 'Configurar en Partner Admin',
    email: 'pagos@adrielssystems.com',
    network: 'Binance Pay (USDT / USDC)',
    instructions: 'Transfiere vía Binance Pay sin comisiones y pega tu Order ID / TxID.',
  },
  zelle: {
    enabled: true,
    email: 'pagos@adrielssystems.com',
    holder: "Adriel's Systems",
    instructions: 'Envía el monto en USD por Zelle e indica el titular y número de confirmación.',
  },
  pago_movil: {
    enabled: true,
    bank: 'Configurar Banco',
    document: 'V-00000000',
    phone: '0414-0000000',
    rate_note: 'Consultar tasa BCV del día antes de transferir.',
    instructions: 'Realiza el Pago Móvil y reporta los últimos 6 dígitos de referencia y banco emisor.',
  },
  whatsapp_support: '584222476127',
};

let schemaReady = false;
async function ensureBillingSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_code VARCHAR(40) DEFAULT 'profesional'`);
  await query(`
    CREATE TABLE IF NOT EXISTS payment_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      plan_code VARCHAR(40) NOT NULL,
      amount_usd NUMERIC(10, 2) NOT NULL,
      payment_method VARCHAR(30) NOT NULL,
      reference_code VARCHAR(150) NOT NULL,
      payer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      certified_by UUID REFERENCES users(id) ON DELETE SET NULL,
      certified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(
    `INSERT INTO platform_settings (key, value) VALUES ('billing_accounts', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DEFAULT_BILLING_ACCOUNTS)]
  );
  schemaReady = true;
}

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await ensureBillingSchema();

  const [paymentsRes, accountsRes] = await Promise.all([
    query(`
      SELECT pr.*,
             t.name AS tenant_name,
             t.slug AS tenant_slug,
             t.status AS tenant_status,
             u.email AS user_email,
             u.name AS user_name
      FROM payment_requests pr
      JOIN tenants t ON t.id = pr.tenant_id
      LEFT JOIN users u ON u.id = pr.user_id
      ORDER BY CASE WHEN pr.status = 'pending' THEN 0 ELSE 1 END, pr.created_at DESC
      LIMIT 100
    `),
    query(`SELECT value FROM platform_settings WHERE key = 'billing_accounts' LIMIT 1`),
  ]);

  const payments = paymentsRes.rows;
  const certifiedUsd = payments
    .filter((p) => p.status === 'certified')
    .reduce((acc, p) => acc + Number(p.amount_usd || 0), 0);
  const pendingRows = payments.filter((p) => p.status === 'pending');
  const pendingUsd = pendingRows.reduce((acc, p) => acc + Number(p.amount_usd || 0), 0);

  return NextResponse.json({
    payments,
    accounts: { ...DEFAULT_BILLING_ACCOUNTS, ...(accountsRes.rows[0]?.value || {}) },
    stats: {
      certifiedUsd,
      pendingCount: pendingRows.length,
      pendingUsd,
    },
  });
}

export async function PATCH(req) {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await ensureBillingSchema();
  const body = await req.json();

  if (body.accounts) {
    await query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ('billing_accounts', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(body.accounts)]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.paymentId && ['certify', 'reject'].includes(body.action)) {
    const nextStatus = body.action === 'certify' ? 'certified' : 'rejected';
    await withTransaction(async (client) => {
      const pRes = await client.query(
        `UPDATE payment_requests
         SET status = $1,
             admin_notes = $2,
             certified_by = $3,
             certified_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
         RETURNING tenant_id, plan_code`,
        [nextStatus, body.adminNotes || null, auth.user.id, body.paymentId]
      );

      if (pRes.rowCount === 0) {
        throw new Error('Pago no encontrado.');
      }

      if (nextStatus === 'certified') {
        const { tenant_id, plan_code } = pRes.rows[0];
        await client.query(
          `UPDATE tenants
           SET status = 'active',
               plan_code = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [plan_code, tenant_id]
        );
      }
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  }

  return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
}
