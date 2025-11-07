
import type {NextConfig} from 'next';

const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: isElectronBuild ? { staticExport: true } : true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: isElectronBuild,
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
    NEXT_PUBLIC_IS_DESKTOP: String(isElectronBuild),
  },
  output: isElectronBuild ? 'export' : undefined,
};

export default nextConfig;
