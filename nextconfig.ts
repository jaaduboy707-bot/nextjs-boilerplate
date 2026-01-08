import { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    // Add raw-loader for .md files
    config.module.rules.push({
      test: /\.md$/i,
      use: "raw-loader",
    });

    return config;
  },
};

export default nextConfig;
