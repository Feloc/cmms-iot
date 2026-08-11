/** @type {import('next').NextConfig} */
const apiProxyTarget = (
  process.env.API_PROXY_TARGET ||
  process.env.API_INTERNAL_URL ||
  'http://api:3001'
).replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
