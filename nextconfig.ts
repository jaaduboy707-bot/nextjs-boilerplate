import { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    // Modern way to import raw Markdown as string
    config.module.rules.push({
      test: /\.md$/i,
      type: "asset/source", // <-- no need to install raw-loader
    });

    return config;
  },
};

export default nextConfig;
