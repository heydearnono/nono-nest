import { describe, expect, it } from 'vitest';

import { defaultSave, normalizeSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/storage/doc.md（`SAVE` 区）
describe('defaultSave', () => {
  it('每次返回新对象，改一份不影响另一份', () => {
    const a = defaultSave();
    const b = defaultSave();

    a.currency.star = 99;
    a.habits.push('x');
    a.days['2026-08-11'] = {};

    expect(b.currency.star).toBe(0);
    expect(b.habits).toEqual([]);
    expect(b.days).toEqual({});
  });

  it('能 JSON 往返而不变形', () => {
    const save = defaultSave();
    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
  });
});

describe('normalizeSave 的补齐', () => {
  it('[SAVE-01] undefined（首次进入）等于 defaultSave()', () => {
    expect(normalizeSave(undefined)).toEqual(defaultSave());
  });

  it('[SAVE-02] 只含 currency.star 时其余取默认值，star 保留', () => {
    const result = normalizeSave({ currency: { star: 7 } });

    expect(result.currency.star).toBe(7);
    expect(result.pet).toEqual(defaultSave().pet);
    expect(result.childName).toBe('nono');
    expect(result.parent).toEqual(defaultSave().parent);
  });

  it('[SAVE-03] currency 缺 petFood 时补 0，不是 undefined', () => {
    const result = normalizeSave({ currency: { star: 1, gem: 2, medal: 3 } });

    expect(result.currency.petFood).toBe(0);
    expect('petFood' in result.currency).toBe(true);
  });

  it('[SAVE-04] 非对象输入等于 defaultSave()，不抛错', () => {
    for (const raw of [0, 42, 'save', [], null, true, Number.NaN]) {
      expect(normalizeSave(raw)).toEqual(defaultSave());
    }
  });
});

describe('normalizeSave 的数值收敛', () => {
  it('[SAVE-05] pet.fullness 为 9 收敛到 5', () => {
    expect(normalizeSave({ pet: { fullness: 9 } }).pet.fullness).toBe(5);
  });

  it('[SAVE-06] pet.fullness 为 -1 收敛到 0', () => {
    expect(normalizeSave({ pet: { fullness: -1 } }).pet.fullness).toBe(0);
  });

  it('[SAVE-07] pet.fullness 为 2.7 四舍五入到 3', () => {
    expect(normalizeSave({ pet: { fullness: 2.7 } }).pet.fullness).toBe(3);
    expect(normalizeSave({ pet: { mood: 4.2 } }).pet.mood).toBe(4);
  });

  it('[SAVE-08] pet.petLevel 为 0 收敛到 1', () => {
    expect(normalizeSave({ pet: { petLevel: 0 } }).pet.petLevel).toBe(1);
    expect(normalizeSave({ pet: { petLevel: -3 } }).pet.petLevel).toBe(1);
  });

  it('[SAVE-09] currency.star 为 -5 收敛到 0', () => {
    const result = normalizeSave({ currency: { star: -5, gem: -1, petFood: -2, medal: -9 } });

    expect(result.currency).toEqual({ star: 0, gem: 0, petFood: 0, medal: 0 });
  });

  it('[SAVE-12] pet.lastFedAt 缺失 / 为负 / 非数值一律补 0', () => {
    expect(normalizeSave({}).pet.lastFedAt).toBe(0);
    expect('lastFedAt' in normalizeSave({}).pet).toBe(true);
    expect(normalizeSave({ pet: { lastFedAt: -1 } }).pet.lastFedAt).toBe(0);
    expect(normalizeSave({ pet: { lastFedAt: '昨天' } }).pet.lastFedAt).toBe(0);
    // 合法值原样保留 —— 衰减的基准不能被收敛掉
    expect(normalizeSave({ pet: { lastFedAt: 1754880000000 } }).pet.lastFedAt).toBe(1754880000000);
  });
});

describe('normalizeSave 的字段白名单与透传', () => {
  it('[SAVE-10] 未知顶层字段 foo 被丢弃', () => {
    const result = normalizeSave({ foo: 'bar', pointRules: {}, currency: { star: 1 } });

    expect('foo' in result).toBe(false);
    expect('pointRules' in result).toBe(false);
    expect(Object.keys(result).sort()).toEqual(Object.keys(defaultSave()).sort());
  });

  it('[SAVE-11] days 里的合法日期键原样保留', () => {
    const day = { completedTasks: { wake: true }, ledger: [{ star: 2 }] };
    const result = normalizeSave({ days: { '2026-08-11': day } });

    expect(result.days['2026-08-11']).toEqual(day);
  });
});
