import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // E2E の実行結果。生成物なので検査しない
    // (残っていると HTML レポートの束ねられた JS が数千件の指摘になる)
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
