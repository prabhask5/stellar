import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@stellar/shared", "@stellar/db", "@stellar/ui-tokens", "@stellar/universe"],
  serverExternalPackages: ["@node-rs/argon2", "pg", "web-push"],
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: false,
  devIndicators: false,
};

export default nextConfig;
