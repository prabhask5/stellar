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
  // Agent context for this repository is the root CLAUDE.md; `next dev` must not write its own file.
  agentRules: false,
  // Baseline hardening for every response. No Content-Security-Policy here: Next's inline
  // bootstrap scripts would need per-request nonces, which static shells cannot carry.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The planner is never meant to be framed by another site.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
