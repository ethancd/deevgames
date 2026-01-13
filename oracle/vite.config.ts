import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/oracle/',
  server: {
    port: 3001,
    host: true, // Expose to local network for mobile testing
  },
})
