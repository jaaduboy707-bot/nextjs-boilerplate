import { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    appDir: true,
  },
  webpack: (config, { isServer }) => {
    // This allows .md files to be imported as strings
    config.module.rules.push({
      test: /\.md$/i,
      type: "asset/source",
    });

    return config;
  },
};

export default nextConfig;
