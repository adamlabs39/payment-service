import globals from 'globals';
import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default [
  // Konfigurasi dasar ESLint
  pluginJs.configs.recommended,

  // Konfigurasi untuk menonaktifkan aturan yang bentrok dengan Prettier
  eslintConfigPrettier,

  // Konfigurasi untuk lingkungan Node.js
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      ecmaVersion: 2022,
    },
  },

  // Konfigurasi untuk menjalankan Prettier sebagai aturan ESLint
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'warn',
    },
  },
];
