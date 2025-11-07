import type {NextConfig} from 'next';

const isTauri = process.env.TAURI_BUILD === 'true';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: !isTauri,
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
  env: {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'testreportgen',
    NEXT_PUBLIC_IS_DESKTOP: String(isTauri),
  },
  output: isTauri ? 'export' : undefined,
  distDir: isTauri ? 'out' : '.next',
};

export default nextConfig;
