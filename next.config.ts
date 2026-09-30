import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporary: serve the static design prototype until the pages are ported.
  async redirects() {
    return [
      { source: "/", destination: "/design/index.html", permanent: false },
      { source: "/design", destination: "/design/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
