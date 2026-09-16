// Dedicated SAST-only ESLint config, used exclusively by scripts/deploy/sast-check.ps1.
// Kept separate from .eslintrc.js so the security ruleset never affects `npm run lint`.
//
// eslint-plugin-security's own `plugin:security/recommended` export (v4.x installed here)
// is flat-config-only and incompatible with this project's classic .eslintrc.js format
// ("Unexpected top-level property 'name'"), so its rules are listed explicitly below
// instead (queried directly from the installed package's `rules` export) - version
// independent of whatever shape the plugin's "recommended" preset takes in future.
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*",
    "/generated/**/*",
  ],
  plugins: [
    "@typescript-eslint",
    "security",
  ],
  rules: {
    "security/detect-unsafe-regex": "error",
    "security/detect-non-literal-regexp": "error",
    "security/detect-non-literal-require": "error",
    "security/detect-non-literal-fs-filename": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-pseudoRandomBytes": "error",
    "security/detect-possible-timing-attacks": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-buffer-noassert": "error",
    "security/detect-child-process": "error",
    "security/detect-disable-mustache-escape": "error",
    "security/detect-object-injection": "error",
    "security/detect-new-buffer": "error",
    "security/detect-bidi-characters": "error",
  },
};
