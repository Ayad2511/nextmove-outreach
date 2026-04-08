import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Instrumentation hook is stabiel sinds Next.js 15 — geen experimental vlag nodig
  // instrumentation.ts draait automatisch bij serverstart voor auto-migratie
};

export default nextConfig;
