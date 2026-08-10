import { describe, expect, it } from 'vitest';

import { greetingFor } from '../miniprogram/utils/greeting.js';

// 规格来源：docs/features/greeting/doc.md
// 测试标题里的 [GREET-0N] 由 scripts/validate-docs.mjs 与规格表双向校验
describe('greetingFor', () => {
  it('[GREET-01] 0-5 点返回睡觉提示', () => {
    expect(greetingFor(0)).toBe('夜深了，小宠物在打呼噜');
    expect(greetingFor(5)).toBe('夜深了，小宠物在打呼噜');
  });

  it('[GREET-02] 6-10 点返回早上好', () => {
    expect(greetingFor(6)).toBe('早上好，糯糯');
    expect(greetingFor(10)).toBe('早上好，糯糯');
  });

  it('[GREET-03] 11-13 点返回吃饭提示', () => {
    expect(greetingFor(11)).toBe('午安，该吃饭啦');
    expect(greetingFor(13)).toBe('午安，该吃饭啦');
  });

  it('[GREET-04] 14-17 点返回一起玩', () => {
    expect(greetingFor(14)).toBe('下午好，一起玩吧');
    expect(greetingFor(17)).toBe('下午好，一起玩吧');
  });

  it('[GREET-05] 18-23 点返回晚上好', () => {
    expect(greetingFor(18)).toBe('晚上好，糯糯');
    expect(greetingFor(23)).toBe('晚上好，糯糯');
  });

  it('[GREET-06] 非 0-23 整数抛 RangeError', () => {
    expect(() => greetingFor(-1)).toThrow(RangeError);
    expect(() => greetingFor(24)).toThrow(RangeError);
    expect(() => greetingFor(1.5)).toThrow(RangeError);
    expect(() => greetingFor('8')).toThrow(RangeError);
  });
});
