import globals from "globals";

export default [
  { ignores: ["**/node_modules/**", "**/.next/**"] },
  {
    files: ["scripts/test-access-ui.js"],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ["shared/**/*.js", "services/access.js", "services/auth.js", "services/database.js", "services/ai.js", "services/ai/analyticsContext.js", "services/ai/memoryManager.js", "index.js", "scripts/*access*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
    rules: { "no-undef": "error", "no-dupe-keys": "error", "no-unreachable": "error", "no-eval": "error" }
  },
  {
    files: ["frontend/app/**/*.{js,jsx}", "frontend/components/**/*.{js,jsx}", "frontend/lib/**/*.js"],
    languageOptions: { sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    rules: { "no-undef": "error", "no-dupe-keys": "error", "no-unreachable": "error", "no-eval": "error" }
  }
];
