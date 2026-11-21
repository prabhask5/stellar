import next from "@next/eslint-plugin-next";
import root from "../../eslint.config.mjs";

export default [
  ...root,
  { ignores: ["test-results/**", "playwright-report/**", "e2e/.tmp/**"] },
  {
    plugins: { "@next/next": next },
    rules: { ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules },
  },
];
