import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'main.js', 'coverage/**'] },
  { ...js.configs.recommended, files: ['src/**/*.ts'] },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['src/**/*.ts'] })),
  { files: ['src/**/*.ts'], languageOptions: { globals: {
    window: 'readonly', document: 'readonly', crypto: 'readonly', console: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly', btoa: 'readonly',
    Element: 'readonly', Node: 'readonly', NodeFilter: 'readonly', ErrorEvent: 'readonly', DOMParser: 'readonly'
  } }, rules: { '@typescript-eslint/no-empty-function': 'off' } }
);
