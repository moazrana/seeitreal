// Root ESLint flat config, shared by backend/ and frontend/ once they exist.
// Each workspace can extend this with its own eslint.config.js if it needs
// framework-specific rules (e.g. @nestjs or eslint-plugin-react).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // backend/ and frontend/ each own their own eslint config (flat config
    // doesn't cascade) — this root config covers shared/ and any top-level
    // files only.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/*.glb',
      '**/*.usdz',
      'backend/**',
      'frontend/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
