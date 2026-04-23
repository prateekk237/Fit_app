/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Our Web Push handlers live in public/push-handler.js and get pulled
  // into the Workbox-generated service worker via importScripts.
  importScripts: ["/push-handler.js"],
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
