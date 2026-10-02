// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ['server/**/*.js', 'shared/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { Buffer: 'readonly' },
    },
  },
  {
    files: ['tests/app-config.test.js', 'tests/feedback-sounds.test.js'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
]);
