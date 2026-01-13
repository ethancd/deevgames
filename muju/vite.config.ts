import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/muju/',
  server: {
    port: 3002,
    host: true,
  },
})
