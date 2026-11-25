-- =============================================================================
-- Migración 02: Core SaaS Multitenant + Feature Flags + Multi-LLM + Google
--               Workspace + Motor de Agendamiento + Vertical Dermatología (F1)
-- Idempotente: segura para ejecutar sobre bases de datos existentes.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- -----------------------------------------------------------------------------
-- 1. Evolución de tabla TENANTS (Módulos activables, Vertical, TZ, Branding)
-- -----------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS industry VARCHAR(80) DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'America/Caracas',
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '["inbox","contacts","appointments"]'::jsonb,
  ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{"primaryColor":"#6366F1","accentColor":"#22D3EE","logoUrl":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"mon":[{"start":"08:00","end":"17:00"}],"tue":[{"start":"08:00","end":"17:00"}],"wed":[{"start":"08:00","end":"17:00"}],"thu":[{"start":"08:00","end":"17:00"}],"fri":[{"start":"08:00","end":"17:00"}],"sat":[],"sun":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Evolución de CONTACTS (tags + deduplicación segura + UNIQUE constraint)
-- -----------------------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[];

-- Limpiar posibles duplicados previos antes de crear índice único
DELETE FROM contacts a
USING contacts b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.channel = b.channel
  AND a.external_id IS NOT NULL
  AND a.external_id = b.external_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_contact_tenant_channel_external'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT unique_contact_tenant_channel_external
      UNIQUE (tenant_id, channel, external_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);

-- -----------------------------------------------------------------------------
-- 3. Evolución de MESSAGES (Idempotencia wamid + estado de entrega)
-- -----------------------------------------------------------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) DEFAULT 'received';

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tenant_external_id
  ON messages(tenant_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Evolución de TENANT_META_CONFIGS (WABA ID para plantillas)
-- -----------------------------------------------------------------------------
ALTER TABLE tenant_meta_configs
  ADD COLUMN IF NOT EXISTS waba_id TEXT,
  ADD COLUMN IF NOT EXISTS templates_config JSONB DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 5. Configuración global de plataforma (Admin & Backend defaults: Gemini / DeepSeek)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_settings (key, value)
VALUES (
  'ai_defaults',
  '{
    "admin_provider": "gemini",
    "admin_model": "gemini-2.5-flash",
    "fallback_provider": "deepseek",
    "fallback_model": "deepseek-chat",
    "allowed_tenant_providers": ["gemini", "deepseek", "openai", "anthropic"]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Configuración Multi-LLM independiente por Tenant (BYOK + Prompts + Triaje)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT TRUE,
  provider VARCHAR(50) NOT NULL DEFAULT 'gemini', -- 'gemini', 'deepseek', 'openai', 'anthropic'
  model VARCHAR(120) NOT NULL DEFAULT 'gemini-2.5-flash',
  use_platform_key BOOLEAN DEFAULT TRUE,
  api_key_encrypted TEXT,
  temperature NUMERIC(3,2) DEFAULT 0.30,
  system_prompt TEXT DEFAULT '',
  knowledge_base TEXT DEFAULT '',
  triage_enabled BOOLEAN DEFAULT TRUE,
  triage_prompt TEXT DEFAULT 'Antes de confirmar la cita, pregunta amablemente el motivo de la consulta para asignar el servicio y la duración adecuada.',
  handoff_keywords TEXT[] DEFAULT ARRAY['humano', 'asesor', 'recepcion', 'emergencia', 'urgente'],
  memory_window INT DEFAULT 16,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. Integraciones Google Workspace por Tenant (Calendar, Drive, Gmail, Sheets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_google_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  google_email VARCHAR(255),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}'::text[],
  enabled_products JSONB DEFAULT '["calendar"]'::jsonb, -- ["calendar","drive","gmail","sheets"]
  calendar_id VARCHAR(255) DEFAULT 'primary',
  calendar_sync_enabled BOOLEAN DEFAULT TRUE,
  create_meet_links BOOLEAN DEFAULT FALSE,
  drive_folder_id VARCHAR(255),
  sheets_spreadsheet_id VARCHAR(255),
  sync_token TEXT,
  status VARCHAR(30) DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_tenant_google_primary UNIQUE (tenant_id)
);

-- -----------------------------------------------------------------------------
-- 8. Motor de Agendamiento Genérico: Servicios / Motivos de Consulta
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(80),
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  buffer_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120),
  price NUMERIC(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  color VARCHAR(20) DEFAULT '#6366F1',
  preparation_notes TEXT, -- Indicaciones previas a la consulta/procedimiento
  triage_keywords TEXT[] DEFAULT '{}'::text[], -- Palabras clave para que la IA elija este servicio
  follow_up_days INT, -- Días tras completar la cita para seguimiento automático (ej. 15 o 30)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id, is_active);

-- -----------------------------------------------------------------------------
-- 9. Reglas de Disponibilidad Semanal y Bloqueos Puntuales
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Dom .. 6=Sab
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_tenant ON availability_rules(tenant_id, day_of_week);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Bloqueo de agenda',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(40) DEFAULT 'manual', -- 'manual', 'google_calendar'
  external_event_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_tenant_range ON availability_blocks(tenant_id, start_at, end_at);

-- -----------------------------------------------------------------------------
-- 10. Citas / Appointments (con protección atómica contra solapamientos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  provider_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'no_show'
  triage_reason TEXT,
  notes TEXT,
  source VARCHAR(40) DEFAULT 'manual', -- 'manual', 'ai_whatsapp', 'ai_instagram', 'webchat'
  google_event_id VARCHAR(255),
  meet_link TEXT,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_at > start_at)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_active_appointments'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT no_overlapping_active_appointments
      EXCLUDE USING gist (
        tenant_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (status IN ('scheduled', 'confirmed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON appointments(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(tenant_id, status);

-- -----------------------------------------------------------------------------
-- 11. Ficha Básica de Paciente (Vertical Salud / Dermatología - Fase 1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  document_id VARCHAR(80), -- Cédula / Pasaporte / DNI
  birth_date DATE,
  gender VARCHAR(30),
  blood_type VARCHAR(10),
  insurance_provider VARCHAR(150),
  insurance_policy VARCHAR(120),
  allergies TEXT,
  medical_history TEXT,
  skin_type VARCHAR(80), -- Ej. Fototipo Fitzpatrick I-VI / Grasa / Mixta / Sensible
  current_routine TEXT,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_tenant ON patient_profiles(tenant_id);

-- -----------------------------------------------------------------------------
-- 12. Cola Persistente de Automatizaciones (Worker Docker)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  job_type VARCHAR(60) NOT NULL, -- 'confirm_instant', 'reminder_24h', 'reminder_2h', 'followup_post_visit', 'gcal_sync'
  channel VARCHAR(40) DEFAULT 'whatsapp',
  run_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  payload JSONB DEFAULT '{}'::jsonb,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
  ON automation_jobs(status, run_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_jobs_tenant ON automation_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_appointment ON automation_jobs(appointment_id);

-- -----------------------------------------------------------------------------
-- 13. Seed idempotente para Tenant Demo (Dermatología de prueba + horarios)
-- -----------------------------------------------------------------------------
UPDATE tenants
SET
  industry = CASE WHEN industry IS NULL OR industry = 'general' THEN 'dermatology' ELSE industry END,
  timezone = COALESCE(timezone, 'America/Caracas'),
  enabled_modules = CASE
    WHEN enabled_modules IS NULL OR enabled_modules = '["inbox","contacts","appointments"]'::jsonb
    THEN '["inbox","contacts","appointments","patients"]'::jsonb
    ELSE enabled_modules
  END
WHERE id = 'a0000000-0000-0000-0000-000000000001';

INSERT INTO tenant_ai_configs (tenant_id, provider, model, system_prompt, knowledge_base)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'gemini',
  'gemini-2.5-flash',
  'Eres la asistente virtual de agendamiento del consultorio dermatológico. Eres cálida, precisa y profesional. Respondes dudas sobre horarios, ubicación, precios, seguros y preparación previa. Antes de confirmar cualquier cita, pregunta el motivo de consulta (ej. acné, revisión de lunares, botox, caída del cabello) para seleccionar el servicio y duración adecuados.',
  'Ubicación: Torre Médica Central, Piso 4, Consultorio 402. Estacionamiento disponible. Aceptamos seguros principales previa verificación y pagos por transferencia, Zelle, efectivo y tarjeta.'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Servicios dermatológicos iniciales solo si el tenant demo aún no tiene servicios
INSERT INTO services (tenant_id, name, code, description, duration_minutes, buffer_minutes, price, currency, color, preparation_notes, triage_keywords, follow_up_days)
SELECT * FROM (
  VALUES
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'Consulta Dermatológica General / Acné', 'derm-acne', 'Evaluación clínica integral de piel, acné, rosácea o dermatitis.', 30, 10, 60.00, 'USD', '#6366F1', 'Acudir con el rostro limpio y sin maquillaje. Traer fotos o lista de productos de skincare actuales.', ARRAY['acne','acné','granos','rosacea','piel','manchas','consulta','dermatitis'], 30),
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'Revisión de Lunares (Dermatoscopía)', 'derm-lunares', 'Mapeo y evaluación dermatoscópica de nevos y lesiones pigmentadas.', 40, 10, 75.00, 'USD', '#22D3EE', 'No aplicar cremas con color ni autobronceadores 24h antes de la evaluación.', ARRAY['lunar','lunares','mancha','melanoma','dermatoscopia','verruga'], 30),
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'Aplicación de Toxina Botulínica (Botox)', 'derm-botox', 'Evaluación facial dinámica y aplicación de toxina botulínica estética.', 45, 15, 220.00, 'USD', '#EC4899', 'Evitar aspirina, ibuprofeno o alcohol 24h antes. No realizar ejercicio intenso el mismo día.', ARRAY['botox','toxina','arrugas','lineas','estetica','rejuvenecimiento'], 15),
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'Tricología / Caída del Cabello', 'derm-cabello', 'Diagnóstico capilar con tricoscopía y plan para alopecia o caída.', 40, 10, 70.00, 'USD', '#10B981', 'No lavar el cabello el mismo día de la consulta ni aplicar geles o lacas.', ARRAY['cabello','pelo','caida','caída','alopecia','caspa','cuero cabelludo'], 30)
) AS v(tenant_id, name, code, description, duration_minutes, buffer_minutes, price, currency, color, preparation_notes, triage_keywords, follow_up_days)
WHERE NOT EXISTS (
  SELECT 1 FROM services WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid
);

-- Reglas semanales Lunes a Viernes 08:30 - 17:30 para el tenant demo si no existen
INSERT INTO availability_rules (tenant_id, day_of_week, start_time, end_time, is_active)
SELECT 'a0000000-0000-0000-0000-000000000001'::uuid, d, '08:30'::time, '17:30'::time, true
FROM generate_series(1, 5) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM availability_rules WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid
);
