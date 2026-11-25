-- Extensión para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabla de Tenants (Organizaciones / Clientes del CRM)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Usuarios (con rol y pertenencia a Tenant)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'agent', -- 'superadmin', 'admin', 'agent'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Configuración Meta por Tenant (Instagram / WhatsApp / Facebook)
CREATE TABLE IF NOT EXISTS tenant_meta_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL, -- 'whatsapp', 'instagram', 'facebook'
    app_id TEXT,
    app_secret TEXT,
    page_id TEXT, -- ID de Página de Facebook / Instagram Business vinculada
    instagram_account_id TEXT, -- ID de cuenta comercial de Instagram
    phone_number_id TEXT, -- ID de teléfono para WhatsApp Cloud API / YCloud
    access_token TEXT, -- Token de acceso de página o API Key
    verify_token TEXT, -- Token de verificación de Webhook de Meta
    bot_enabled BOOLEAN DEFAULT TRUE,
    ai_prompt TEXT,
    ai_knowledge_base TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_channel UNIQUE (tenant_id, channel)
);

-- 4. Contactos / Leads del CRM (aislados por tenant)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    phone VARCHAR(100),
    email VARCHAR(255),
    instagram_username VARCHAR(255),
    external_id VARCHAR(255), -- ID de Meta o número telefónico de WhatsApp
    channel VARCHAR(50) DEFAULT 'whatsapp',
    lead_status VARCHAR(50) DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Conversaciones (hilos de chat de cada canal por tenant)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    session_id VARCHAR(255) NOT NULL, -- Identificador de la sesión / chat
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'paused_ai', 'closed'
    ai_enabled BOOLEAN DEFAULT TRUE,
    unread_count INT DEFAULT 0,
    last_message_preview TEXT,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_session UNIQUE (tenant_id, channel, session_id)
);

-- 6. Mensajes individuales de las conversaciones
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- 'contact', 'agent', 'bot', 'system'
    sender_id TEXT,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'video', 'audio', 'document', 'interactive'
    media_url TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Registro de Webhooks entrantes
CREATE TABLE IF NOT EXISTS webhook_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    channel VARCHAR(50),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'received',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alto rendimiento para consultas multitenant
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meta_configs_tenant ON tenant_meta_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meta_configs_page ON tenant_meta_configs(page_id);
CREATE INDEX IF NOT EXISTS idx_meta_configs_phone ON tenant_meta_configs(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_meta_configs_ig ON tenant_meta_configs(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant ON webhook_logs(tenant_id);

-- Inserción de Tenant de prueba por defecto
INSERT INTO tenants (id, name, slug)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Munirix Demo', 'munirix-demo')
ON CONFLICT (slug) DO NOTHING;

-- Usuario administrador de prueba (password: 'admin123' con hash bcrypt de ejemplo)
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Admin Demo',
    'demo@munirix.net',
    '$2a$10$wN9aB8N/hF3l.1oU3m1yLe4j81v92r7eN1m.QkP4jZ13bS2V4v3eG', -- password de desarrollo
    'admin'
) ON CONFLICT (email) DO NOTHING;
