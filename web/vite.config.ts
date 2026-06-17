import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 源河 demo —— 单机人机，纯前端，零后端。
export default defineConfig({
  plugins: [react()],
  server: { port: 5300, open: true },
});
