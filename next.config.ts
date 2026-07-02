import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Permite um dev server paralelo (ex.: preview de outra sessão) sem colidir
  // com o lock por distDir do Next 16. Builds de produção ignoram (default .next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
