/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source", // treat .md files as raw text
    });
    return config;
  },
};

module.exports = nextConfig;
