import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出，部署到 Cloudflare Pages
  output: "export",
  // 图片资源（PWA 用）
  images: { unoptimized: true },
  // 静态导出时禁用
  trailingSlash: true,
};

export default nextConfig;
