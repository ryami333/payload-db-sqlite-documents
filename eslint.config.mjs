import eslintJs from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/"]),
  eslintJs.configs.recommended,
  tseslint.configs.recommended,
]);
