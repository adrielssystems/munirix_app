import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || 'munirix_fallback_secret_set_NEXTAUTH_SECRET_in_env',
    cookieName: 'munirix-admin.session-token',
  });

  const pathname = req.nextUrl.pathname;
  const isLogin = pathname.startsWith('/login');

  if (isLogin) {
    if (token && token.role === 'superadmin') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    return NextResponse.next();
  }

  if (!token || token.role !== 'superadmin') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
