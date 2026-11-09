import type { NextConfig } from "next";

const BCI_API_URL = process.env.BCI_API_URL || "http://127.0.0.1:8765";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/bci/:path*",
        destination: `${BCI_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
