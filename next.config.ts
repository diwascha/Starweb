
import type {NextConfig} from 'next';

const isTauri = process.env.TAURI_BUILD === 'true';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: isTauri,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: isTauri ? 'export' : undefined,
  distDir: isTauri ? 'out' : '.next',
};

export default nextConfig;
