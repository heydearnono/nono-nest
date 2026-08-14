import { describe, expect, it } from 'vitest';

import { weekKeys } from '../miniprogram/utils/dayKey.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import {
  awardAllDone,
  awardWeeklyBonus,
  checkAndAward,
  coreDone,
  dayEarned,
  isQualifiedDay,
  ledgerOf,
  listCore,
  uncheckAndRefund,
} from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/point/doc.md（`POINT` 区）

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 12, 0, 0, 0).getTime();

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 一份货币已有余额的存档，便于看清扣回是从余额里扣 */
function withCurrency(save, currency) {
  return { ...save, currency: { ...save.currency, ...currency } };
}

describe('发放', () => {
  it('[POINT-01] 打卡 wake 后 star 与 petFood 各 +1', () => {
    const next = checkAndAward(seeded(), DAY, 'wake', NOW);

    expect(next.currency.star).toBe(1);
    expect(next.currency.petFood).toBe(1);
    expect(next.currency.gem).toBe(0);
    expect(next.currency.medal).toBe(0);
  });

  it('[POINT-02] 打卡后当天流水追加一条 earn', () => {
    const next = checkAndAward(seeded(), DAY, 'wake', NOW);
    const ledger = ledgerOf(next, DAY);

    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual({
      at: NOW,
      type: 'earn',
      reason: '完成：按时起床',
      star: 1,
      gem: 0,
      petFood: 1,
      medal: 0,
    });
  });

  it('[POINT-03] 流水的 reason 是「完成：」加任务名', () => {
    const next = checkAndAward(seeded(), DAY, 'brush-am', NOW);

    expect(ledgerOf(next, DAY)[0].reason).toBe('完成：早上刷牙');
  });

  it('[POINT-04] 连续两次打卡同一项：货币不变，流水仍只有一条', () => {
    const once = checkAndAward(seeded(), DAY, 'wake', NOW);
    const twice = checkAndAward(once, DAY, 'wake', NOW + 1000);

    expect(twice).toBe(once);
    expect(twice.currency.star).toBe(1);
    expect(ledgerOf(twice, DAY)).toHaveLength(1);
  });

  it('[POINT-05] learning 类的 literacy 产出 2 星 2 粮（读任务自身字段）', () => {
    const next = checkAndAward(seeded(), DAY, 'literacy', NOW);

    expect(next.currency.star).toBe(2);
    expect(next.currency.petFood).toBe(2);
  });

  it('[POINT-06] 不改传入的 save', () => {
    const save = seeded();
    checkAndAward(save, DAY, 'wake', NOW);

    expect(save.currency).toEqual({ star: 0, gem: 0, petFood: 0, medal: 0 });
    expect(save.days).toEqual({});
  });

  it('[POINT-07] 发放的同时也写了 checks', () => {
    const next = checkAndAward(seeded(), DAY, 'wake', NOW);

    expect(next.days[DAY].checks.wake).toEqual({ at: NOW });
  });
});

describe('扣回', () => {
  it('[POINT-08] 取消已打卡的项：货币扣回，checks 键被删', () => {
    const checked = checkAndAward(seeded(), DAY, 'wake', NOW);
    const next = uncheckAndRefund(checked, DAY, 'wake', NOW + 1000);

    expect(next.currency.star).toBe(0);
    expect(next.currency.petFood).toBe(0);
    expect('wake' in next.days[DAY].checks).toBe(false);
  });

  it('[POINT-09] 取消后流水追加一条 spend', () => {
    const checked = checkAndAward(seeded(), DAY, 'wake', NOW);
    const next = uncheckAndRefund(checked, DAY, 'wake', NOW + 1000);
    const ledger = ledgerOf(next, DAY);

    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toEqual({
      at: NOW + 1000,
      type: 'spend',
      reason: '取消：按时起床',
      star: 1,
      gem: 0,
      petFood: 1,
      medal: 0,
    });
  });

  it('[POINT-10] 货币已是 0 时取消：货币收敛到 0 不为负，流水仍记应扣的量', () => {
    // 打了卡但货币被花光（喂宠物、兑换……），此时取消打卡
    const checked = checkAndAward(seeded(), DAY, 'wake', NOW);
    const broke = withCurrency(checked, { star: 0, petFood: 0 });
    const next = uncheckAndRefund(broke, DAY, 'wake', NOW + 1000);

    expect(next.currency.star).toBe(0);
    expect(next.currency.petFood).toBe(0);
    // 流水是账、货币是余额：账上仍记这一笔应扣 1 星 1 粮
    expect(ledgerOf(next, DAY)[1]).toMatchObject({ type: 'spend', star: 1, petFood: 1 });
  });

  it('[POINT-11] 取消没打过卡的项：原样返回，货币与流水都不变', () => {
    const save = withCurrency(seeded(), { star: 7 });
    const next = uncheckAndRefund(save, DAY, 'wake', NOW);

    expect(next).toBe(save);
    expect(next.currency.star).toBe(7);
    expect(ledgerOf(next, DAY)).toEqual([]);
  });

  it('[POINT-12] 未知 habitId 抛 RangeError', () => {
    const save = seeded();

    expect(() => checkAndAward(save, DAY, 'nope', NOW)).toThrow(RangeError);
    expect(() => uncheckAndRefund(save, DAY, 'nope', NOW)).toThrow(RangeError);
  });

  it('[POINT-13] now 非有限数抛 TypeError', () => {
    const save = seeded();
    const checked = checkAndAward(save, DAY, 'wake', NOW);

    expect(() => checkAndAward(save, DAY, 'wake', Number.NaN)).toThrow(TypeError);
    expect(() => uncheckAndRefund(checked, DAY, 'wake', Number.POSITIVE_INFINITY)).toThrow(
      TypeError,
    );
  });
});

describe('流水与查询', () => {
  it('[POINT-14] ledgerOf 一个不存在的日期键返回空数组', () => {
    expect(ledgerOf(seeded(), '1999-01-01')).toEqual([]);
  });

  it('[POINT-15] 打卡两项后流水按发生顺序', () => {
    let save = checkAndAward(seeded(), DAY, 'wake', NOW);
    save = checkAndAward(save, DAY, 'brush-am', NOW + 5000);

    expect(ledgerOf(save, DAY).map((e) => e.reason)).toEqual(['完成：按时起床', '完成：早上刷牙']);
  });

  it('[POINT-16] checks 与 ledger 是兄弟键，互不覆盖', () => {
    const save = checkAndAward(seeded(), DAY, 'wake', NOW);
    const day = save.days[DAY];

    expect(Object.keys(day).sort()).toEqual(['checks', 'ledger']);
    expect(day.checks.wake).toEqual({ at: NOW });
    expect(day.ledger).toHaveLength(1);
  });

  it('[POINT-17] 打卡后又取消，当天净额是 0', () => {
    const checked = checkAndAward(seeded(), DAY, 'wake', NOW);
    const next = uncheckAndRefund(checked, DAY, 'wake', NOW + 1000);

    expect(dayEarned(next, DAY)).toEqual({ star: 0, gem: 0, petFood: 0, medal: 0 });
  });

  it('[POINT-18] 打了两项 habit 后的当天净额', () => {
    let save = checkAndAward(seeded(), DAY, 'wake', NOW);
    save = checkAndAward(save, DAY, 'sleep', NOW + 1000);

    expect(dayEarned(save, DAY)).toEqual({ star: 2, gem: 0, petFood: 2, medal: 0 });
  });

  it('[POINT-19] dayEarned 不把别的日期的流水算进来', () => {
    let save = checkAndAward(seeded(), '2026-08-11', 'wake', NOW - 86400000);
    save = checkAndAward(save, DAY, 'wake', NOW);

    expect(dayEarned(save, DAY)).toEqual({ star: 1, gem: 0, petFood: 1, medal: 0 });
    expect(dayEarned(save, '2026-08-11')).toEqual({ star: 1, gem: 0, petFood: 1, medal: 0 });
  });
});

describe('与 HABIT 区的边界', () => {
  it('停用的任务仍可被 POINT 打卡 —— 过滤是 listHabits 的事，不是 findHabit 的事', () => {
    const save = seeded();
    const disabled = {
      ...save,
      habits: save.habits.map((h) => (h.id === 'wake' ? { ...h, enabled: false } : h)),
    };

    // 首页不会渲染它，所以正常路径下点不到；但 findHabit 不看 enabled，
    // 这条钉住「停用」的语义只在渲染层，不在发放层
    expect(checkAndAward(disabled, DAY, 'wake', NOW).currency.star).toBe(1);
  });
});

// —— 以下是 P3-b 追加的今日全勤与周奖励（POINT-20 ~ POINT-31）——

/** 七条核心项，与 data/defaultHabits.js 的 `core: true` 一致 */
const CORE = ['wake', 'brush-am', 'literacy', 'reading', 'exercise', 'vegetables', 'poop'];

/** 挨个打卡（走 checkAndAward，不走 pet.js 那层，所以不会顺带结算） */
function checkAll(save, key, ids, now = NOW) {
  return ids.reduce((acc, id, i) => checkAndAward(acc, key, id, now + i), save);
}

/** 把某几条任务停用 */
function disable(save, ids) {
  return {
    ...save,
    habits: save.habits.map((h) => (ids.includes(h.id) ? { ...h, enabled: false } : h)),
  };
}

describe('今日全勤', () => {
  it('[POINT-20] 七条核心项全部打上后结算，勋章 +1 并写流水', () => {
    const next = awardAllDone(checkAll(seeded(), DAY, CORE), DAY, NOW);

    expect(next.currency.medal).toBe(1);
    expect(ledgerOf(next, DAY).at(-1)).toEqual({
      at: NOW,
      type: 'earn',
      reason: '今日全勤',
      star: 0,
      gem: 0,
      petFood: 0,
      medal: 1,
    });
  });

  it('[POINT-21] 全勤后当天的水位 bonuses.allDone 为 true', () => {
    const next = awardAllDone(checkAll(seeded(), DAY, CORE), DAY, NOW);

    expect(next.days[DAY].bonuses.allDone).toBe(true);
    // checks / ledger / bonuses 是兄弟键，互不覆盖
    expect(Object.keys(next.days[DAY]).sort()).toEqual(['bonuses', 'checks', 'ledger']);
  });

  it('[POINT-22] 只打上六条核心项时不发勋章，也不产生 bonuses', () => {
    const six = checkAll(seeded(), DAY, CORE.slice(0, 6));
    const next = awardAllDone(six, DAY, NOW);

    expect(next).toBe(six);
    expect(next.currency.medal).toBe(0);
    expect('bonuses' in next.days[DAY]).toBe(false);
  });

  it('[POINT-23] 已全勤后再结算一次，原样返回且勋章仍只 +1', () => {
    const once = awardAllDone(checkAll(seeded(), DAY, CORE), DAY, NOW);
    const twice = awardAllDone(once, DAY, NOW + 1000);

    expect(twice).toBe(once);
    expect(twice.currency.medal).toBe(1);
  });

  it('[POINT-24] 全勤后取消一项打卡，勋章不退、水位不清，重新打满不再发第二枚', () => {
    const awarded = awardAllDone(checkAll(seeded(), DAY, CORE), DAY, NOW);
    const cancelled = uncheckAndRefund(awarded, DAY, 'poop', NOW + 1000);

    // 「温和，不惩罚」：勋章不退，水位也不清
    expect(cancelled.currency.medal).toBe(1);
    expect(cancelled.days[DAY].bonuses.allDone).toBe(true);

    const again = awardAllDone(checkAll(cancelled, DAY, ['poop'], NOW + 2000), DAY, NOW + 3000);
    expect(again.currency.medal).toBe(1);
  });

  it('[POINT-25] poop 被家长停用时打满其余六条也算全勤（分母跟着启用状态变）', () => {
    const save = disable(seeded(), ['poop']);
    const next = awardAllDone(checkAll(save, DAY, CORE.slice(0, 6)), DAY, NOW);

    expect(listCore(save)).toHaveLength(6);
    expect(next.currency.medal).toBe(1);
    expect(next.days[DAY].bonuses.allDone).toBe(true);
  });

  it('[POINT-26] 七条核心项全被停用时不算全勤', () => {
    // 一条核心项都没有的存档若算全勤，就会天天白发一枚勋章
    const save = disable(seeded(), CORE);

    expect(listCore(save)).toEqual([]);
    expect(coreDone(save, DAY)).toBe(0);
    expect(awardAllDone(save, DAY, NOW)).toBe(save);
  });

  it('[POINT-27] 打上九条非核心项不算全勤 —— 判据是核心项，不是「全部打卡项」', () => {
    const nonCore = ['brush-pm', 'dress', 'toys', 'room', 'desk', 'bag', 'sleep', 'guoxue', 'math'];
    const save = checkAll(seeded(), DAY, nonCore);

    expect(coreDone(save, DAY)).toBe(0);
    expect(awardAllDone(save, DAY, NOW)).toBe(save);
  });
});

describe('周奖励', () => {
  // 2026-08-12 是周三，本周是 08-10（周一）~ 08-16
  const WEEK = weekKeys(NOW);

  /** 让指定的几天各达标（每天打满前 done 条核心项） */
  function qualifyDays(save, keys, done = 5) {
    return keys.reduce((acc, key) => checkAll(acc, key, CORE.slice(0, done)), save);
  }

  it('[POINT-28] 本周五天达标后结算，star +5、gem +1 并写流水', () => {
    const save = qualifyDays(seeded(), WEEK.slice(0, 5));
    const before = save.currency.star;
    const next = awardWeeklyBonus(save, DAY, NOW);

    expect(next.currency.star).toBe(before + 5);
    expect(next.currency.gem).toBe(1);
    // 流水落在今天名下：这笔奖励确实是今天到账的
    expect(ledgerOf(next, DAY).at(-1)).toMatchObject({
      type: 'earn',
      reason: '本周打卡 5 天达标',
      star: 5,
      gem: 1,
      medal: 0,
    });
  });

  it('[POINT-29] 发过之后 lastWeeklyBonusWeek 是本周周一的日期键', () => {
    const next = awardWeeklyBonus(qualifyDays(seeded(), WEEK.slice(0, 5)), DAY, NOW);

    expect(next.lastWeeklyBonusWeek).toBe('2026-08-10');
    expect(next.lastWeeklyBonusWeek).toBe(WEEK[0]);
  });

  it('[POINT-30] 某天核心项只完成四条时那天不算达标日，达标四天不发周奖励', () => {
    const four = checkAll(seeded(), WEEK[0], CORE.slice(0, 4));
    expect(isQualifiedDay(four, WEEK[0])).toBe(false);

    // 另外四天各打满五条 —— 本周只有四个达标日
    const save = qualifyDays(four, WEEK.slice(1, 5));
    expect(WEEK.filter((k) => isQualifiedDay(save, k))).toHaveLength(4);
    expect(awardWeeklyBonus(save, DAY, NOW)).toBe(save);
  });

  it('[POINT-31] 本周已发过后原样返回；跨到下周一可再发一次', () => {
    const once = awardWeeklyBonus(qualifyDays(seeded(), WEEK.slice(0, 5)), DAY, NOW);
    expect(awardWeeklyBonus(once, DAY, NOW + 1000)).toBe(once);

    // 下周一（2026-08-17）：水位不等于新的周键，且新一周里也攒够了五个达标日
    const nextMonday = new Date(2026, 7, 17, 12, 0, 0, 0).getTime();
    const nextWeek = weekKeys(nextMonday);
    const saved = qualifyDays(once, nextWeek.slice(0, 5));
    const again = awardWeeklyBonus(saved, nextWeek[0], nextMonday);

    expect(again.lastWeeklyBonusWeek).toBe('2026-08-17');
    expect(again.currency.gem).toBe(2);
  });
});
