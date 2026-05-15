import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig(({ mode }) => {
  // Load env variables based on mode
  // This automatically loads .env, .env.local, and .env.[mode] files
  const env = loadEnv(mode, process.cwd(), '');
  const cesiumIonToken = env.VITE_CESIUM_ION_TOKEN || env['Cesium.Ion.defaultAccessToken'] || '';

  const backendPort = process.env.GS_BACKEND_PORT || '5000';
  const backendHost = process.env.GS_BACKEND_HOST || '127.0.0.1';

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: `${cesiumSource}/{Assets,ThirdParty,Widgets,Workers}/**/*`,
            dest: cesiumBaseUrl,
            rename: { stripBase: 4 },
          },
        ],
      }),
    ],

    // Define custom environment variables
    define: {
      CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
      'import.meta.env.VITE_CESIUM_ION_TOKEN': JSON.stringify(cesiumIonToken),
      // Allow using GS_BACKEND_PORT directly without VITE_ prefix
      'import.meta.env.GS_BACKEND_PORT': JSON.stringify(process.env.GS_BACKEND_PORT || '5000'),
      'import.meta.env.GS_BACKEND_HOST': JSON.stringify(process.env.GS_BACKEND_HOST || '127.0.0.1'),
    },

    // Explicitly set the public directory
    publicDir: 'public',

    // Server configuration for development
    server: {
      port: 5173,
      strictPort: true,
      host: true, // Listen on all addresses

      // Add proxy configuration
      proxy: {
        '/api': {
          target: `http://${backendHost}:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    // Build configuration
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode !== 'production', // Generate sourcemaps except in production

      // Optimize chunks
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router'],
            cesium: ['cesium'],
          },
        },
      },
    },

    // Resolve configuration
    resolve: {
      alias: {
        '@': '/src', // Allow using @ as an alias for /src directory
      },
    },
  };
});
