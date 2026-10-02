import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // scripts/ は型検査(tsc)の対象外なので、綴り間違いや
  // 消し忘れた変数への参照は実行するまで分からない。lint で拾う。
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: { "no-undef": "error" },
  },
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
    // Supabase CLI がローカル起動時に展開する生成物
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
