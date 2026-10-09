import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    target: "es2020",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        bento: resolve(__dirname, "bento.html"),
        maximalism: resolve(__dirname, "maximalism.html"),
        minimalism: resolve(__dirname, "minimalism.html"),
        spatial: resolve(__dirname, "spatial.html"),
      },
    },
  },
  server: { port: 4321 },
});
