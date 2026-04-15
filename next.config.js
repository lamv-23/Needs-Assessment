/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent better-sqlite3 (native module) from being bundled by webpack (Next.js 14)
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    outputFileTracingIncludes: {
      '/*': ['./data/cache.db'],
    },
  },
};

module.exports = nextConfig;
