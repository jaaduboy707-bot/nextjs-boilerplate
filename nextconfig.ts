import { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ---------------------------
  // Webpack customization
  // ---------------------------
  webpack: (config) => {
    // Allow importing .md files as raw strings
    config.module.rules.push({
      test: /\.md$/i,
      type: "asset/source", // modern replacement for raw-loader
    });

    return config;
  },
};

export default nextConfig;
