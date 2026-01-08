// next.config.ts
import type { NextConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  webpack: (config: Configuration) => {
    if (config.module?.rules) {
      config.module.rules.push({
        test: /\.md$/,
        type: "asset/source", // import markdown as raw string
      });
    }
    return config;
  },
};

export default nextConfig;
