import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    ignores: [
      'build/**',
      'node_modules/**',
      'out/**',
      'output/**',
      'release/**',
      'test-results/**',
      '.local-dev/**',
      '**/*.d.ts',
      '**/*.tsbuildinfo'
    ]
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.{js,mjs}', '*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      'no-useless-escape': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    files: ['electron.vite.config.ts', 'playwright.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
]
