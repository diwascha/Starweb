
import type {NextConfig} from 'next';

const isElectron = process.env.IS_ELECTRON === 'true';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      staticExport: isElectron,
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: isElectron, // Unoptimized images are required for static export.
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
    // We now set NEXT_PUBLIC_IS_DESKTOP based on the reliable `isElectron` flag.
    NEXT_PUBLIC_IS_DESKTOP: String(isElectron),
  },
  // Use static export (`output: 'export'`) only when it's an Electron build.
  output: isElectron ? 'export' : undefined,
  distDir: isElectron ? 'out' : '.next',
};

export default nextConfig;
