import type {NextConfig} from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  trailingSlash: true,
  outputFileTracingRoot: __dirname,
  // Type errors used to be ignored at build time, which is how a read of a
  // field that does not exist on the type (`purchaseOrder.deliveryLocation`)
  // shipped and printed the wrong address on every purchase order. `tsc
  // --noEmit` is clean, so turning this on costs nothing today and stops the
  // next one.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
       {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/testreportgen.appspot.com/o/**',
      },
    ],
  },
};

export default nextConfig;
