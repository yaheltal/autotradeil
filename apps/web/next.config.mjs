/** @type {import('next').NextConfig} */
const nextConfig = {
  // Built-in compression + tighter SWC for production bundles.
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

  images: {
    // next/image handles AVIF / WebP encoding automatically. Listing
    // both formats here means the browser picks the smallest variant
    // it supports (AVIF on modern Chrome/Safari → ~30% smaller than WebP).
    formats: ["image/avif", "image/webp"],
    // Cache derived images for 30 days at the edge.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Cloudinary serves both KYC docs (signed) and inventory photos.
    // Allow remote optimization through next/image so existing Cloudinary
    // <img> tags can be migrated incrementally without env churn.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },

  async headers() {
    return [
      {
        // Brand assets in /public never change content for a given
        // filename — set immutable + 1-year max-age. If we update the
        // logo, the bytes are different and the path stays the same;
        // cache invalidation is handled by Vercel's edge cache key
        // including the build ID.
        source: "/:asset(logo-full.png|logo-full-white.png|logo-icon.png|logo-icon-512.png|favicon.ico|favicon-16x16.png|favicon-32x32.png|apple-touch-icon.png|og-image.png|manifest.json|logo-full.webp|logo-full-white.webp|logo-icon.webp|og-image.webp)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Default cache for everything else under /public/_next/static —
        // Next.js already sets immutable here, but we set explicitly so
        // dev-mode previews behave the same.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },
};

// Sentry — wrap the config when a DSN is set so source-maps upload
// during prod builds. With no DSN the wrapper is a pass-through.
// withSentryConfig is dynamic-imported so dev sessions without the
// package installed (or with @sentry/nextjs failing for any reason)
// still load the app config cleanly.
async function maybeWithSentry(cfg) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return cfg;
  try {
    const { withSentryConfig } = await import("@sentry/nextjs");
    return withSentryConfig(cfg, {
      // Source-map upload requires SENTRY_AUTH_TOKEN at build time.
      // Set it in Vercel project env (NOT NEXT_PUBLIC_*).
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Hide source maps from the public bundle but still upload them
      // to Sentry — keeps stack traces useful without leaking source
      // to anyone who opens devtools.
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: true,
    });
  } catch {
    return cfg;
  }
}

export default await maybeWithSentry(nextConfig);
