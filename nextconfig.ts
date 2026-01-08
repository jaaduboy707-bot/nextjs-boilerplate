import { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    // Modern way to handle .md files
    config.module.rules.push({
      test: /\.md$/i,
      type: 'asset/source', // built-in, no raw-loader needed
    });

    return config;
  },
};

export default nextConfig;
