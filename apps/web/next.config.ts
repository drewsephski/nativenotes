import type { NextConfig } from "next";

import {
  buildBackendRewrites,
  validateBackendOrigin,
} from "./src/lib/backend-rewrites";

/**
 * Public Next.js surface. Backend-owned paths are proxied via external
 * rewrites to NATIVE_NOTES_BACKEND_ORIGIN (server-only; never NEXT_PUBLIC).
 *
 * Local dual-port: leave NATIVE_NOTES_BACKEND_ORIGIN unset and point
 * NEXT_PUBLIC_NATIVE_NOTES_API_URL at http://localhost:3000.
 */
function resolveRewriteOrigin(): string | null {
  const raw = process.env.NATIVE_NOTES_BACKEND_ORIGIN?.trim();
  if (!raw) {
    // Fail closed on Vercel; allow local `next build` without rewrites.
    if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
      throw new Error(
        "NATIVE_NOTES_BACKEND_ORIGIN is required on Vercel (absolute https backend origin, not nativenotes.app)",
      );
    }
    return null;
  }

  const requireProductionHttps =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL === "1";

  return validateBackendOrigin(raw, { requireProductionHttps });
}

const nextConfig: NextConfig = {
  async rewrites() {
    const origin = resolveRewriteOrigin();
    if (!origin) return [];
    return buildBackendRewrites(origin);
  },
};

export default nextConfig;
