import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['node:sqlite'],
  experimental: { serverActions: { bodySizeLimit: '60mb' } },
};

export default config;
