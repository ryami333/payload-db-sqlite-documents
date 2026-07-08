import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { builtinModules } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.mjs"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((item) => `node:${item}`),
      ],
    },
  },
});
