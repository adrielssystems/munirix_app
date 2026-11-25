if (process.env.ADMIN_NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.ADMIN_NEXTAUTH_URL;
} else if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = 'https://app.munirix.net';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
};

export default nextConfig;
