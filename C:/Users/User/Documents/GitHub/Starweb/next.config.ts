
import type {NextConfig} from 'next';

const isTauri = !!process.env.TAURI_BUILD;

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: true, // Enable Server Actions
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: isTauri, // Unoptimize images for static export
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
  // Conditionally set the output to 'export' only for the Tauri build
  output: isTauri ? 'export' : undefined,
};

export default nextConfig;
