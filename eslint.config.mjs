// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules", "dist", ".next"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn", // Downgrade from error to warning
      "no-undef": "off", // This can conflict with TypeScript's own checking
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  }
);
