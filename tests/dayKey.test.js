import { describe, expect, it } from 'vitest';

import { dayKey, dayKeyAfter, isSameDay, weekKeys } from '../miniprogram/utils/dayKey.js';

// 规格来源：docs/features/storage/doc.md（`DAY` 区）
// 时间戳一律用 `new Date(y, m, d, ...)` 构造 —— 该构造函数按本机时区解释入参，
// 与 dayKey 的本机时区约定一致；不调 Date.now()，断言才可重复。
describe('dayKey', () => {
  it('[DAY-01] 本机时区的时刻转成 YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 7, 11, 13, 45).getTime())).toBe('2026-08-11');
  });

  it('[DAY-02] 月、日为个位数时补零', () => {
    expect(dayKey(new Date(2026, 0, 5, 9, 0).getTime())).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 8, 1, 0, 0).getTime())).toBe('2026-09-01');
  });
});

describe('isSameDay', () => {
  it('[DAY-03] 同一自然日内的 0:00 与 23:59 为 true', () => {
    const start = new Date(2026, 7, 11, 0, 0, 0, 0).getTime();
    const end = new Date(2026, 7, 11, 23, 59, 59, 999).getTime();

    expect(isSameDay(start, end)).toBe(true);
  });

  it('[DAY-04] 相邻两日的 23:59 与次日 0:00 为 false', () => {
    const lastMoment = new Date(2026, 7, 11, 23, 59, 59, 999).getTime();
    const nextMidnight = new Date(2026, 7, 12, 0, 0, 0, 0).getTime();

    expect(isSameDay(lastMoment, nextMidnight)).toBe(false);
    // 只差 1 毫秒也要分成两天：跨日以本机时区 0 点为界
    expect(nextMidnight - lastMoment).toBe(1);
  });
});

describe('dayKey 的非法入参', () => {
  it('[DAY-05] now 非有限数抛 TypeError', () => {
    expect(() => dayKey(Number.NaN)).toThrow(TypeError);
    expect(() => dayKey('2026-08-11')).toThrow(TypeError);
    expect(() => dayKey(null)).toThrow(TypeError);
    expect(() => dayKey(undefined)).toThrow(TypeError);
    expect(() => dayKey(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => isSameDay(Number.NaN, 0)).toThrow(TypeError);
  });
});

// 2026-08-10 是周一，08-16 是周日 —— 下面几条都落在这一周里。
const THAT_WEEK = [
  '2026-08-10',
  '2026-08-11',
  '2026-08-12',
  '2026-08-13',
  '2026-08-14',
  '2026-08-15',
  '2026-08-16',
];

describe('weekKeys', () => {
  it('[DAY-06] 周三给出周一到周日七个键', () => {
    const wednesday = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();

    expect(weekKeys(wednesday)).toEqual(THAT_WEEK);
    expect(weekKeys(wednesday)[0]).toBe('2026-08-10'); // 周一在首位
  });

  it('[DAY-07] 周日归到它前面那个周一，落在末位', () => {
    const sunday = new Date(2026, 7, 16, 21, 30, 0, 0).getTime();

    // getDay() 的周日是 0，用 1 - 0 会推到下一周 —— 这条就是那个错的回归防线
    expect(weekKeys(sunday)).toEqual(THAT_WEEK);
    expect(weekKeys(sunday)[6]).toBe('2026-08-16');
    expect(weekKeys(sunday)).toEqual(weekKeys(new Date(2026, 7, 10, 8, 0).getTime()));
  });

  it('[DAY-08] 跨年正确', () => {
    // 2026-12-31 是周四，那一周从 12-28（周一）到 2027-01-03（周日）
    expect(weekKeys(new Date(2026, 11, 31, 12, 0).getTime())).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('[DAY-09] now 非有限数抛 TypeError', () => {
    expect(() => weekKeys(Number.NaN)).toThrow(TypeError);
    expect(() => weekKeys('2026-08-12')).toThrow(TypeError);
    expect(() => weekKeys(null)).toThrow(TypeError);
    expect(() => weekKeys(undefined)).toThrow(TypeError);
  });
});

describe('dayKeyAfter', () => {
  const wednesday = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();

  it('[DAY-10] days 为 0 就是今天', () => {
    expect(dayKeyAfter(wednesday, 0)).toBe('2026-08-12');
    expect(dayKeyAfter(wednesday, 0)).toBe(dayKey(wednesday));
    // 一天里的任何时刻给出同一个键（锚中午之后不受原时刻影响）
    expect(dayKeyAfter(new Date(2026, 7, 12, 0, 0, 0, 0).getTime(), 0)).toBe('2026-08-12');
    expect(dayKeyAfter(new Date(2026, 7, 12, 23, 59, 59, 999).getTime(), 0)).toBe('2026-08-12');
  });

  it('[DAY-11] 复习间隔表的六档都落在正确的日子上', () => {
    // REVIEW_STEPS = [1, 2, 4, 7, 14, 30]，最长那一档要跨月
    expect(dayKeyAfter(wednesday, 1)).toBe('2026-08-13');
    expect(dayKeyAfter(wednesday, 2)).toBe('2026-08-14');
    expect(dayKeyAfter(wednesday, 4)).toBe('2026-08-16');
    expect(dayKeyAfter(wednesday, 7)).toBe('2026-08-19');
    expect(dayKeyAfter(wednesday, 14)).toBe('2026-08-26');
    expect(dayKeyAfter(wednesday, 30)).toBe('2026-09-11');
    // 负数往前，跨年也由 Date 自己进位
    expect(dayKeyAfter(wednesday, -1)).toBe('2026-08-11');
    expect(dayKeyAfter(new Date(2026, 11, 31, 12, 0).getTime(), 1)).toBe('2027-01-01');
  });

  it('[DAY-12] days 非整数抛 RangeError，now 非有限数抛 TypeError', () => {
    expect(() => dayKeyAfter(wednesday, 2.5)).toThrow(RangeError);
    expect(() => dayKeyAfter(wednesday, Number.NaN)).toThrow(RangeError);
    expect(() => dayKeyAfter(wednesday, '3')).toThrow(RangeError);
    expect(() => dayKeyAfter(wednesday, undefined)).toThrow(RangeError);
    expect(() => dayKeyAfter(Number.NaN, 1)).toThrow(TypeError);
    expect(() => dayKeyAfter('2026-08-12', 1)).toThrow(TypeError);
  });
});
