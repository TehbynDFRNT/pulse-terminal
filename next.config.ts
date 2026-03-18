import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/signal',
        destination: '/dashboard',
        permanent: false,
      },
      {
        source: '/analytics',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
