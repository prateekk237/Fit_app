/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.youtube-nocookie.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "wger.de" },
      { protocol: "https", hostname: "cdn.wger.de" },
    ],
  },
};

module.exports = withPWA(nextConfig);
