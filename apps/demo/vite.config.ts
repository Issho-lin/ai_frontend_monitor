import { defineConfig } from 'vite'

// Demo app for M1 local ingest smoke: open http://127.0.0.1:5174/
export default defineConfig({
  server: {
    port: 5174,
    host: '127.0.0.1',
    strictPort: true,
  },
})
