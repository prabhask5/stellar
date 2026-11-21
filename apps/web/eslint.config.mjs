import next from "@next/eslint-plugin-next";
import root from "../../eslint.config.mjs";

export default [
  ...root,
  { ignores: ["test-results/**", "playwright-report/**", "e2e/.tmp/**"] },
  {
    plugins: { "@next/next": next },
    rules: { ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules },
  },
  {
    // Playwright fixtures call a callback named `use` and take `{}` when they need no fixtures.
    files: ["e2e/**"],
    rules: { "react-hooks/rules-of-hooks": "off", "no-empty-pattern": "off" },
  },
];
