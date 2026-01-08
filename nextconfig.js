// next.config.ts
import type { NextConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  webpack(config: Configuration) {
    // Treat .md files as raw text so we can import them safely
    config.module?.rules?.push({
      test: /\.md$/,
      type: "asset/source",
    });

    return config;
  },
};

export default nextConfig;
