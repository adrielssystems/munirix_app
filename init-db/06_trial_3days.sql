-- ============================================================================
-- Migración 06: Prueba Gratuita de 3 Días (Trial) para Nuevos Tenants
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
