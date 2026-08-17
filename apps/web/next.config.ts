import type { NextConfig } from "next";
import {
  createApiRewrite,
  resolveApiOrigin,
} from "./src/lib/api-client/api-origin";

const nextConfig: NextConfig = {
  async rewrites() {
    return [createApiRewrite(resolveApiOrigin(process.env.API_ORIGIN))];
  },
};

export default nextConfig;
