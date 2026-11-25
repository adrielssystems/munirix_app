import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const res = await query(`SELECT key, value, updated_at FROM platform_settings WHERE key = 'ai_defaults'`);
  const aiDefaults = res.rows[0]?.value || {
    admin_provider: 'gemini',
    admin_model: 'gemini-2.5-flash',
    fallback_provider: 'deepseek',
    fallback_model: 'deepseek-chat',
    allowed_tenant_providers: ['gemini', 'deepseek', 'openai', 'anthropic'],
  };

  return NextResponse.json({
    aiDefaults,
    envStatus: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      metaAppSecret: Boolean(process.env.META_APP_SECRET),
      encryptionKey: Boolean(process.env.ENCRYPTION_KEY),
    },
  });
}

export async function PATCH(req) {
  const auth = await requireSuperadmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const value = {
      admin_provider: body.admin_provider === 'deepseek' ? 'deepseek' : 'gemini',
      admin_model: String(body.admin_model || 'gemini-2.5-flash'),
      fallback_provider: body.fallback_provider === 'gemini' ? 'gemini' : 'deepseek',
      fallback_model: String(body.fallback_model || 'deepseek-chat'),
      allowed_tenant_providers: Array.isArray(body.allowed_tenant_providers)
        ? body.allowed_tenant_providers
        : ['gemini', 'deepseek', 'openai', 'anthropic'],
    };

    await query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ('ai_defaults', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(value)]
    );

    return NextResponse.json({ aiDefaults: value });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

