import { recmaPlugins } from "./src/mdx/recma.mjs";
import { rehypePlugins } from "./src/mdx/rehype.mjs";
import { remarkPlugins } from "./src/mdx/remark.mjs";
import withSearch from "./src/mdx/search.mjs";
import nextMDX from "@next/mdx";

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 启用 instrumentation hook（用于集成 worker）
  experimental: {
    instrumentationHook: true,
  },
  // 配置 webpack 忽略 bullmq 的动态 require warning
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 忽略 bullmq 的 child-processor 动态 require 警告
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        {
          module: /node_modules\/bullmq/,
          message: /Critical dependency/,
        },
      ];
    }
    return config;
  },
};

export default withSearch(withMDX(nextConfig));

// export default million.next(
//   withSearch(withMDX(nextConfig)), { auto: { rsc: true } }
// );
