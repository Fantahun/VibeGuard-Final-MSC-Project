'use strict';

const security = require('eslint-plugin-security');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'logs/**',
      'output/**',
      'dist/**',
      'build/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        clearTimeout: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
      },
    },
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
];
