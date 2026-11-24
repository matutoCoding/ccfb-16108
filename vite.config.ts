import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// 凹版线稿工作台：纯前端工程，base 用相对路径方便静态托管
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
