import next from "@next/eslint-plugin-next";
import root from "../../eslint.config.mjs";

export default [
  ...root,
  {
    plugins: { "@next/next": next },
    rules: { ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules },
  },
];
