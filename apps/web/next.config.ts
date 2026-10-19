import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@leadorbit/ui",
    "@leadorbit/domain",
    "@leadorbit/api-contracts",
  ],
};

export default nextConfig;
