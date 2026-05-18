import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: [],
  experimental: {
    externalDir: true,
  },
  outputFileTracingIncludes: {
    '/api/**': ['./data/reports/**/*'],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@src': path.join(__dirname, '../../src'),
    };
    return config;
  },
};

export default nextConfig;
