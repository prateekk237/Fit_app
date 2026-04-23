/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Our Web Push handlers live in public/push-handler.js and get pulled
  // into the Workbox-generated service worker via importScripts.
  importScripts: ["/push-handler.js"],

  // Runtime caching rules. ORDER MATTERS — first match wins.
  runtimeCaching: [
    // Offline-capable food-log writes. Workbox queues failed POSTs in
    // IndexedDB and replays them on the next successful sync event.
    {
      urlPattern: /\/api\/food-logs(?:\/.*)?$/i,
      method: "POST",
      handler: "NetworkOnly",
      options: {
        backgroundSync: {
          name: "fit-food-logs-queue",
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: /\/api\/water-logs(?:\/.*)?$/i,
      method: "POST",
      handler: "NetworkOnly",
      options: {
        backgroundSync: {
          name: "fit-water-logs-queue",
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    // Authenticated app-shell APIs: stale-while-revalidate so the
    // dashboard renders offline off the last-seen data.
    {
      urlPattern: /\/api\/dashboard\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "fit-dashboard-api",
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern:
        /\/api\/(meals|exercises|workouts|foods|adherence|progress-photos|insights)\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "fit-readonly-api",
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    // Photo bytes (auth'd) — cache individual images for a day.
    {
      urlPattern: /\/api\/photos\/.+$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "fit-photos",
        expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    // Static exercise images.
    {
      urlPattern: /\/exercises\/.+\.(png|jpe?g|webp)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "fit-exercise-images",
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // App icons + manifest.
    {
      urlPattern: /\/icons\/.+$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "fit-icons",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // Fonts / stylesheets / scripts the Next build chunks cover already,
    // but catch anything Workbox precache missed.
    {
      urlPattern: /\.(?:woff2?|ttf|otf)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "fit-fonts",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
      },
    },
  ],
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["sharp", "web-push", "node-cron"],
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.youtube-nocookie.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "wger.de" },
      { protocol: "https", hostname: "cdn.wger.de" },
    ],
  },
  // instrumentation.ts is compiled for both Node and Edge. Our alerts
  // cron module pulls in node-cron and web-push (both Node-only). Mark
  // them external so Edge builds don't try to resolve native deps.
  webpack: (config, { isServer, nextRuntime }) => {
    if (isServer && nextRuntime === "edge") {
      config.externals = [
        ...(config.externals || []),
        "web-push",
        "node-cron",
      ];
    }
    return config;
  },
};

module.exports = withPWA(nextConfig);
