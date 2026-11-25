-- =============================================================================
-- Migración 04: Registro Self-Service con Google (OAuth 2.0 + One Tap / FedCM)
--               y Onboarding de nuevos Clientes / Tenants
-- Idempotente: segura para ejecutar sobre bases de datos existentes.
-- =============================================================================

-- 1. Permitir usuarios autenticados únicamente con Google (sin password_hash)
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(40) DEFAULT 'credentials',
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users(google_sub)
  WHERE google_sub IS NOT NULL;

-- 2. Seguimiento de onboarding y tipo de cuenta en TENANTS
--    Tenants preexistentes quedan marcados como onboarding_completed = TRUE;
--    nuevos tenants auto-registrados arrancan en FALSE para completar su configuración inicial.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE tenants ADD COLUMN onboarding_completed BOOLEAN DEFAULT TRUE;
    UPDATE tenants SET onboarding_completed = TRUE WHERE onboarding_completed IS NULL;
    ALTER TABLE tenants ALTER COLUMN onboarding_completed SET DEFAULT FALSE;
  END IF;
END $$;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(40) DEFAULT 'business';
