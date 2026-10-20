import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default tseslint.config(
  { ignores: ['node_modules/**', 'main.js', 'coverage/**'] },
  { ...js.configs.recommended, files: ['src/**/*.ts'] },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['src/**/*.ts'] })),
  { files: ['src/**/*.ts'], plugins: { obsidianmd }, languageOptions: {
    parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    globals: {
    window: 'readonly', document: 'readonly', crypto: 'readonly', console: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly', btoa: 'readonly',
    Element: 'readonly', Node: 'readonly', NodeFilter: 'readonly', ErrorEvent: 'readonly', DOMParser: 'readonly',
    DocumentFragment: 'readonly', CSSStyleSheet: 'readonly'
  } }, rules: {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    'obsidianmd/no-forbidden-elements': 'error',
    'obsidianmd/prefer-create-el': 'error',
    'obsidianmd/prefer-window-timers': 'error'
  } }
);
