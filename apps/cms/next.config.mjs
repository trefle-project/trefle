import { withPayload } from "@payloadcms/next/withPayload";

/**
 * Security headers for the admin (002-security-hardening).
 *
 * The admin ships Payload's own JS bundle; a nonce/strict `script-src` there
 * risks breaking the panel and is hard to verify. So the admin gets the static
 * headers plus a CSP limited to framing / <object> / <base> — no `script-src`
 * directive, so Payload's bundle is unaffected. Tightening the admin
 * `script-src` is tracked as follow-up (trusted users only). HSTS is added at
 * the Caddy edge.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Payload runs its admin + REST/GraphQL inside this Next.js app.
  // The public renderer is a separate app (apps/web).
  //
  // The admin submits the whole document (GrapesJS project JSON + html + css)
  // in one Server Action POST. The default 1 MB cap 413s on media-heavy pages.
  // 500 KB is a deliberate value (003-post-launch-improvements, FR-007): this
  // payload is JSON only, never binary image data — see the matching comment
  // on `bodyParser.limits.fieldSize` in payload.config.ts, which this MUST
  // stay equal to.
  //
  // PRE-EXISTING BUG FOUND & FIXED HERE: this was top-level (`serverActions:
  // {...}`) since 001, on the assumption it was promoted out of `experimental`
  // in Next 15. It was never re-verified after 002's Payload 3.68 -> 3.88 bump
  // silently pulled in Next 16 (this app is NOT on Next 15, contrary to
  // plan.md's stated Technical Context — see README.md's stack table, also
  // stale). Next 16 moved it BACK under `experimental`
  // (node_modules/next/dist/esm/server/config-schema.js confirms
  // `experimental.serverActions.bodySizeLimit`); the top-level key was a
  // silently-ignored no-op (`next dev` warns "Unrecognized key(s)... 'serverActions'`)
  // — only `bodyParser.limits.fieldSize` in payload.config.ts was ever
  // actually enforced. Nesting it correctly here is what makes this config
  // real, not just documented.
  experimental: { serverActions: { bodySizeLimit: "500kb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
