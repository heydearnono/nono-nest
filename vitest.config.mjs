import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只跑纯逻辑单测；依赖小程序运行时的代码不放进 tests/
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      include: ['miniprogram/utils/**/*.js'],
      reporter: ['text'],
    },
  },
});
