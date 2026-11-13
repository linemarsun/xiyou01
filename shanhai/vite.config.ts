import { defineConfig } from 'vite';

export default defineConfig({
  // 独立工作副本：5199 / 5200 已被其他工作区占用，固定用 5288 避免抢端口
  server: { port: 5288, strictPort: true },
});
