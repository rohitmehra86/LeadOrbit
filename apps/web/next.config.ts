import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@leadorbit/ui",
    "@leadorbit/domain",
    "@leadorbit/api-contracts",
    "@leadorbit/db",
  ],
  serverExternalPackages: ["@supabase/ssr", "@supabase/supabase-js"],

};

export default nextConfig;
