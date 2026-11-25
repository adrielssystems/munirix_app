import { query } from '@/lib/db';
import AdminAiSettings from './AdminAiSettings';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const res = await query(`SELECT value FROM platform_settings WHERE key = 'ai_defaults'`);
  const aiDefaults = res.rows[0]?.value || {
    admin_provider: 'gemini',
    admin_model: 'gemini-2.5-flash',
    fallback_provider: 'deepseek',
    fallback_model: 'deepseek-chat',
    allowed_tenant_providers: ['gemini', 'deepseek', 'openai', 'anthropic'],
  };

  const envStatus = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    metaAppSecret: Boolean(process.env.META_APP_SECRET),
    encryptionKey: Boolean(process.env.ENCRYPTION_KEY),
  };

  return <AdminAiSettings initialDefaults={aiDefaults} envStatus={envStatus} />;
}

