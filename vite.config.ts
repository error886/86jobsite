import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Long-lived vendor chunks so an app update does not re-download them
          manualChunks: {
            react: ['react', 'react-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            leaflet: ['leaflet'],
            motion: ['motion/react']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // db.json is runtime data written by the Express server. Watching it
      // causes a page-reload loop whenever the server syncs its local fallback.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/db.json'],
      },
    },
  };
});
