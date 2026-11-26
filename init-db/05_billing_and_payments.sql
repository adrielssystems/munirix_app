-- ============================================================================
-- Migración 05: Pasarela de Pagos, Planes ($40/$70/$150) y Certificación
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_code VARCHAR(40) DEFAULT 'profesional';

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  plan_code VARCHAR(40) NOT NULL, -- 'profesional' | 'negocio' | 'empresa'
  amount_usd NUMERIC(10, 2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL, -- 'paypal' | 'binance' | 'zelle' | 'pago_movil'
  reference_code VARCHAR(150) NOT NULL,
  payer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending' | 'certified' | 'rejected'
  admin_notes TEXT,
  certified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  certified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant ON payment_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status, created_at DESC);

INSERT INTO platform_settings (key, value)
VALUES (
  'billing_accounts',
  '{
    "paypal": {
      "enabled": true,
      "email": "pagos@adrielssystems.com",
      "checkout_url": "https://paypal.me/adrielssystems",
      "instructions": "Envía el pago exacto en USD a nuestra cuenta PayPal y coloca el ID de transacción."
    },
    "binance": {
      "enabled": true,
      "binance_id": "Configurar en Partner Admin",
      "email": "pagos@adrielssystems.com",
      "network": "Binance Pay (USDT / USDC)",
      "instructions": "Transfiere vía Binance Pay sin comisiones y pega el Order ID / TxID."
    },
    "zelle": {
      "enabled": true,
      "email": "pagos@adrielssystems.com",
      "holder": "Adriel''s Systems",
      "instructions": "Envía el monto en USD por Zelle e indica el titular y número de confirmación."
    },
    "pago_movil": {
      "enabled": true,
      "bank": "Configurar Banco",
      "document": "V-00000000",
      "phone": "0414-0000000",
      "rate_note": "Consultar tasa BCV del día antes de transferir.",
      "instructions": "Realiza el Pago Móvil y reporta los últimos 6 dígitos de referencia y banco emisor."
    },
    "whatsapp_support": "584222476127"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
