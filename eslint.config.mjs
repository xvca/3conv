import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";

// Next 16's React plugin supports ESLint 9; don't force ESLint 10 past its peer range.
export default defineConfig([
  js.configs.recommended,
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "public/ffmpeg/**"]),
]);
