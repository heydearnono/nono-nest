import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // `.scratch/` 是线上 bundle 的逆向工作区（gitignore 里也有它）：里面是压缩过的
    // 浏览器产物，不是本仓库的源码。ESLint 扁平配置不再自动跳过点目录，所以显式列出 ——
    // 不列的话 `npm run check` 会因为别人的 minified 代码报几百条 no-undef
    ignores: ['node_modules/**', 'miniprogram_npm/**', 'coverage/**', 'dist/**', '.scratch/**'],
  },

  js.configs.recommended,

  {
    // 小程序源码：运行在微信小程序容器内，需要声明其注入的全局构造函数
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        wx: 'readonly',
        App: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        Behavior: 'readonly',
        getApp: 'readonly',
        getCurrentPages: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'off',
    },
  },

  {
    // 构建脚本与测试：运行在 Node 环境
    files: ['scripts/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
