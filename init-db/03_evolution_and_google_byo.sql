-- =============================================================================
-- Migración 03: WhatsApp Dual-Provider (Evolution API + Meta Cloud API),
--               Bóveda de API Keys Multi-LLM por Tenant, y Google Cloud BYO OAuth
-- =============================================================================

-- 1. Evolución de tenant_meta_configs para soportar Evolution API y migración a Meta Oficial
ALTER TABLE tenant_meta_configs
  ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(30) DEFAULT 'evolution', -- 'evolution' | 'meta'
  ADD COLUMN IF NOT EXISTS evolution_api_url TEXT,
  ADD COLUMN IF NOT EXISTS evolution_instance VARCHAR(150),
  ADD COLUMN IF NOT EXISTS evolution_api_key_encrypted TEXT;

CREATE INDEX IF NOT EXISTS idx_meta_configs_evolution_instance
  ON tenant_meta_configs(evolution_instance)
  WHERE evolution_instance IS NOT NULL;

-- 2. Bóveda JSONB de API keys cifradas por proveedor en tenant_ai_configs
--    Ej: {"gemini": "enc:v1:...", "deepseek": "enc:v1:...", "openai": "enc:v1:...", "anthropic": "enc:v1:..."}
ALTER TABLE tenant_ai_configs
  ADD COLUMN IF NOT EXISTS provider_keys_encrypted JSONB DEFAULT '{}'::jsonb;

-- 3. Credenciales OAuth propias del Tenant (creadas en console.cloud.google.com)
ALTER TABLE tenant_google_integrations
  ADD COLUMN IF NOT EXISTS custom_client_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_client_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS setup_progress JSONB DEFAULT '{}'::jsonb;
