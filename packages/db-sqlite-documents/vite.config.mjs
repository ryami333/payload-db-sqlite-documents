import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { builtinModules } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((item) => `node:${item}`),
        // `node:sqlite` is still experimental, so Node omits "sqlite" from
        // `builtinModules` — externalize it explicitly, otherwise Vite treats it
        // as a bare dependency and stubs it out "for browser compatibility",
        // leaving `DatabaseSync` undefined in the built `dist/`.
        "sqlite",
        "node:sqlite",
        "payload",
      ],
    },
  },
});
