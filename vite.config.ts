import { defineConfig } from "vite-plus";
import { resolve } from "path";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  root: resolve(__dirname, "src"),
  publicDir: resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@features": resolve(__dirname, "src/features"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/workers/background.ts"),
        content: resolve(__dirname, "src/workers/content.ts"),
        offscreen: resolve(__dirname, "src/workers/offscreen/offscreen.html"),
        sidepanel: resolve(__dirname, "src/pages/sidepanel/sidepanel.html"),
        options: resolve(__dirname, "src/pages/options/options.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  test: {
    environment: "happy-dom",
    include: ["**/*.test.ts"],
    setupFiles: ["./test-setup.ts"],
  },
});
