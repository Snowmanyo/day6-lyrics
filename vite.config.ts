import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/day6-lyrics/',   // 一定要跟你的 repo 名稱一致
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
