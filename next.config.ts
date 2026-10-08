import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/versions/\\[id\\]/refresh': ['./node_modules/ffmpeg-static/**/*'],
    '/api/cron/reconcile': ['./node_modules/ffmpeg-static/**/*'],
  },
};
export default nextConfig;
