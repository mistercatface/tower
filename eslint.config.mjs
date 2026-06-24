import { defineConfig } from "eslint/config";

export default defineConfig([{ files: ["**/*.js"], rules: { curly: ["error", "multi"], "no-multiple-empty-lines": ["error", { max: 0, maxEOF: 0, maxBOF: 0 }] } }]);
