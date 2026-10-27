import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Dev only: bottom-left, the Next.js badge covered « Se déconnecter » at the foot of the side menu.
  devIndicators: { position: 'bottom-right' },
  outputFileTracingIncludes: {
    '/api/versions/\\[id\\]/refresh': ['./.generated/ffmpeg', './public/brand/logo-rimco.png'],
    '/api/versions/\\[id\\]/clips/preview': ['./.generated/ffmpeg'],
    '/api/versions/\\[id\\]/montage/retry': ['./.generated/ffmpeg', './public/brand/logo-rimco.png'],
    '/api/cron/reconcile': ['./.generated/ffmpeg', './public/brand/logo-rimco.png'],
    '/api/admin/asset-kit': ['./public/vehicle-kit'],
  },
};
export default nextConfig;
