import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ember/',
  server: {
    port: 3003,
    host: true,
  },
})
