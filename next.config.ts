import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin sử dụng native modules (gRPC, etc.) không thể bundle được
  // Phải để external để tránh lỗi prerender trong Next.js 16
  serverExternalPackages: ["firebase-admin", "google-auth-library", "@google-cloud/firestore"],
};

export default nextConfig;
