import eslintJs from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/", "sandbox/.next/"]),
  eslintJs.configs.recommended,
  tseslint.configs.recommended,
]);
