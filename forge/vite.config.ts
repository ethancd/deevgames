import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/forge/',
  server: {
    port: 3000,
    host: true, // Expose to local network
  },
})
