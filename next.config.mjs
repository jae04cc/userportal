const isDev = process.env.NODE_ENV !== "production";

/**
 * Next injects inline <script> for hydration payloads and inline <style> for
 * critical CSS, so those two need 'unsafe-inline'. Dev additionally needs
 * 'unsafe-eval' for React Refresh — hence the production/dev split rather than
 * one permissive policy everywhere.
 *
 * img-src stays broad because service icons are arbitrary self-hosted logo URLs.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self' data:",
  // The portal only ever calls its own API; no third-party endpoints.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // libsql ships native/WASM bindings that must not be bundled by webpack
    serverComponentsExternalPackages: ["@libsql/client", "libsql"],

    /**
     * Don't reuse cached page data when navigating.
     *
     * Next keeps a client-side Router Cache and, by default, serves an already
     * visited dynamic route from it for 30 seconds. In an admin area that reads
     * as a bug: rename a category, move to another tab and back, and the old
     * name is still there until you force a reload. Marking pages
     * `force-dynamic` does not affect this — that governs the server, this cache
     * lives in the browser.
     *
     * Zero means every navigation refetches. The cost is a request per
     * navigation against local SQLite, which is nothing next to showing people
     * stale configuration.
     */
    staleTimes: { dynamic: 0, static: 180 },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
