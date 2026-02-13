import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["break-the-iceberg.png"],
      manifest: {
        name: "Break the Ice(berg)",
        short_name: "Break the Ice",
        description: "A quick way to break the ice in any social situation",
        theme_color: "#0a0f1e",
        background_color: "#0a0f1e",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "break-the-iceberg.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "break-the-iceberg.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "break-the-iceberg.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.clerk\..*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "clerk-api",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "./convex"),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        }
      }
    }
  }
}));
