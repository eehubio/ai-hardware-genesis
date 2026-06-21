import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // 浏览器端：API_KEY 始终为空，让前端走 /api/* serverless 接口（在 Vercel 上由 GEMINI_API_KEY 驱动）。
        'process.env.API_KEY': '""',
        'process.env.GEMINI_API_KEY': '""',
        // 云端模块平台地址：构建时注入；不填则 apiService 内部用默认线上地址。
        'process.env.MODULE_API_BASE': JSON.stringify(env.MODULE_API_BASE || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
