import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 单机在浏览器运行；联机开发通过 net/client 连接同主机的 8787 端口。
export default defineConfig({
  plugins: [react()],
  server: { port: 5300, open: true },
});
