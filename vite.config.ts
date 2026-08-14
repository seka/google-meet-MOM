import { defineConfig } from "vite-plus";
import { execFileSync } from "node:child_process";
import { resolve } from "path";

function getBuildId(): string {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const isDirty =
      execFileSync("git", ["status", "--short", "--untracked-files=normal"], {
        encoding: "utf8",
      }).trim().length > 0;
    return isDirty ? `${commit}-dirty` : commit;
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(getBuildId()),
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["public/vendor/**", "public/models/**"],
  },
  lint: {
    ignorePatterns: ["public/vendor/**", "public/models/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  root: resolve(__dirname, "src"),
  publicDir: resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@data": resolve(__dirname, "src/data"),
      "@features": resolve(__dirname, "src/features"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    // Chrome Extension では生成された modulepreload が再利用されず警告になるため無効化する。
    modulePreload: false,
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
