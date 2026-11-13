import { defineConfig } from 'vite';

export default defineConfig({
  // 独立工作副本：与另一个 agent 的 5199 服务彻底隔离
  server: { port: 5200, strictPort: true },
});
