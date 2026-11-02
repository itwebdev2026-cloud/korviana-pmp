import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(projectRoot, 'index.html'),
        purchase: resolve(projectRoot, 'purchase.html'),
        associates: resolve(projectRoot, 'associates.html'),
      },
    },
  },
})
