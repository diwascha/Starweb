
import type {NextConfig} from 'next';

// This is a reliable way to detect if the build is for Tauri,
// as Tauri sets this environment variable during its build process.
const isTauri = !!process.env.TAURI_PLATFORM;

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      staticExport: true,
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: isTauri, // Unoptimized images are required for static export.
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
    // We now set NEXT_PUBLIC_IS_DESKTOP based on the reliable `isTauri` flag.
    NEXT_PUBLIC_IS_DESKTOP: String(isTauri),
  },
  // Use static export (`output: 'export'`) only when it's a Tauri build.
  output: isTauri ? 'export' : undefined,
};

export default nextConfig;
