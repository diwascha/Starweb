
import type {NextConfig} from 'next';

const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
const isTauriBuild = process.env.npm_lifecycle_event === 'tauri:build';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: isDesktop,
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
  env: {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'testreportgen',
    // This environment variable acts as the switch for the desktop build.
    // Set NEXT_PUBLIC_IS_DESKTOP=true when building for Tauri/Electron.
    NEXT_PUBLIC_IS_DESKTOP: process.env.NEXT_PUBLIC_IS_DESKTOP || 'false',
  },
  output: isDesktop && isTauriBuild ? 'export' : undefined,
};

export default nextConfig;
