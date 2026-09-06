import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname
};

export default nextConfig;
