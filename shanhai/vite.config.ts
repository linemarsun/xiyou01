import { defineConfig } from 'vite';

export default defineConfig({
  // 独立工作副本：5199 / 5200 已被其他工作区占用，固定用 5288 避免抢端口
  server: {
    port: 5288,
    strictPort: true,
    // 强制浏览器每次都拉最新代码/资产（曾出现旧 bundle 被缓存，
    // 贴图删除后回退纯色地面导致"地板颜色不统一"的误判）
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  },
});
