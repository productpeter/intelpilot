import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/report",
        destination: `${backendUrl}/report`,
      },
      {
        source: "/report/:path*",
        destination: `${backendUrl}/report/:path*`,
      },
    ];
  },
};

export default nextConfig;
