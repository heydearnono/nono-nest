import { describe, expect, it } from 'vitest';

import { healthState, setHealth, toggleHealth } from '../miniprogram/utils/health.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/health/doc.md（`HEALTH` 区）
// 2026-08-12 是周三，本周是 08-10（周一）~ 08-16（周日）。

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 当天的健康记录（未规范化，直接看存档里落了什么） */
function raw(save) {
  return save.days?.[DAY]?.health ?? {};
}

/** 当天的打卡状态 */
function checks(save) {
  return save.days?.[DAY]?.checks ?? {};
}

describe('健康记录的读取（HEALTH）', () => {
  it('[HEALTH-01] 今天还没记过时 log 十一个字段全是默认值', () => {
    const { log } = healthState(seeded(), DAY, NOW);

    expect(log).toEqual({
      lessSugar: false,
      sugarCount: 0,
      vegetables: false,
      fruit: false,
      water: false,
      poop: false,
      poopIcon: '',
      bath: false,
      bathHair: false,
      exercise: false,
      exerciseMinutes: 0,
    });
  });

  it('[HEALTH-01] poopIcons 与 sugarMax 由 utils 给出，页面不自己写', () => {
    const { poopIcons, sugarMax } = healthState(seeded(), DAY, NOW);

    expect(poopIcons).toEqual([
      { icon: '😊', current: false },
      { icon: '😐', current: false },
      { icon: '😣', current: false },
    ]);
    expect(sugarMax).toBe(20);
  });
});

describe('开关字段与发放（HEALTH）', () => {
  it('[HEALTH-02] 打开吃青菜：记录、打卡、货币、流水四处同时到位', () => {
    const before = seeded();
    const after = toggleHealth(before, DAY, 'vegetables', NOW);

    expect(raw(after).vegetables).toBe(true);
    expect('vegetables' in checks(after)).toBe(true);
    expect(after.currency.star).toBe(before.currency.star + 1);
    expect(after.currency.petFood).toBe(before.currency.petFood + 1);

    const ledger = ledgerOf(after, DAY);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('earn');
    expect(ledger[0].reason).toBe('完成：吃青菜');
  });

  it('[HEALTH-03] 经验 +5（与自律打卡同价，不是学习的 8），开心度 +1', () => {
    const before = seeded();
    const after = toggleHealth(before, DAY, 'vegetables', NOW);

    // 与 LEARN-08 的 8 成对：同一个 checkAwardAndGrow，健康不传第五参数
    expect(after.pet.petExp).toBe(before.pet.petExp + 5);
    expect(after.pet.mood).toBe(Math.min(5, before.pet.mood + 1));
  });

  it('[HEALTH-04] 再点一次：记录转假、打卡键被删、货币退回、流水第二条', () => {
    const before = seeded();
    const on = toggleHealth(before, DAY, 'vegetables', NOW);
    const off = toggleHealth(on, DAY, 'vegetables', NOW);

    expect(raw(off).vegetables).toBe(false);
    expect('vegetables' in checks(off)).toBe(false);
    expect(off.currency.star).toBe(before.currency.star);
    expect(off.currency.petFood).toBe(before.currency.petFood);

    const ledger = ledgerOf(off, DAY);
    expect(ledger).toHaveLength(2);
    expect(ledger[1].type).toBe('spend');
    expect(ledger[1].reason).toBe('取消：吃青菜');
  });

  it('[HEALTH-05] 吃水果只写记录：checks / 货币 / 流水一动不动', () => {
    const before = seeded();
    const after = toggleHealth(before, DAY, 'fruit', NOW);

    // 与 HEALTH-02 刻意不一致：发放要以 data/defaultHabits.js 有没有那条任务为准，
    // 而那张表的 id 集合是今日全勤的分母
    expect(raw(after).fruit).toBe(true);
    expect(checks(after)).toEqual({});
    expect(after.currency).toEqual(before.currency);
    expect(ledgerOf(after, DAY)).toEqual([]);
    expect(after.pet.petExp).toBe(before.pet.petExp);
  });

  it('[HEALTH-06] 未登记的字段抛 RangeError', () => {
    expect(() => toggleHealth(seeded(), DAY, 'sleep', NOW)).toThrow(RangeError);
  });

  it('[HEALTH-07] 传取值字段抛 RangeError', () => {
    expect(() => toggleHealth(seeded(), DAY, 'sugarCount', NOW)).toThrow(RangeError);
    expect(() => toggleHealth(seeded(), DAY, 'poopIcon', NOW)).toThrow(RangeError);
  });

  it('[HEALTH-08] now 非有限数抛 TypeError', () => {
    expect(() => toggleHealth(seeded(), DAY, 'vegetables', Number.NaN)).toThrow(TypeError);
    expect(() => toggleHealth(seeded(), DAY, 'fruit', '现在')).toThrow(TypeError);
  });
});

describe('取值字段（HEALTH）', () => {
  it('[HEALTH-09] 糖数收字符串，不打卡不发放', () => {
    const before = seeded();
    const after = setHealth(before, DAY, 'sugarCount', '3', NOW);

    expect(raw(after).sugarCount).toBe(3);
    expect(checks(after)).toEqual({});
    expect(ledgerOf(after, DAY)).toEqual([]);
    expect(after.currency).toEqual(before.currency);
  });

  it('[HEALTH-10] 糖数越界与小数收敛到 0 / 20 / 3', () => {
    const save = seeded();
    const sugarOf = (value) =>
      healthState(setHealth(save, DAY, 'sugarCount', value, NOW), DAY, NOW);

    expect(sugarOf(-1).log.sugarCount).toBe(0);
    expect(sugarOf(99).log.sugarCount).toBe(20);
    expect(sugarOf(2.6).log.sugarCount).toBe(3);
    // -1 收敛成 0，而记录里本来就是 0，所以这一次命中 HEALTH-15 的同一性：
    // 收敛先算、再比同值，负数写不出一条「写了 0」的落盘
    expect(setHealth(save, DAY, 'sugarCount', -1, NOW)).toBe(save);
    expect(raw(setHealth(save, DAY, 'sugarCount', 99, NOW)).sugarCount).toBe(20);
  });

  it('[HEALTH-11] 选便便心情连带打卡与发放', () => {
    const before = seeded();
    const after = setHealth(before, DAY, 'poopIcon', '😣', NOW);

    // 记录不能自相矛盾：poopIcon 是 😣 但 poop 是 false 读起来讲不通
    expect(raw(after).poopIcon).toBe('😣');
    expect(raw(after).poop).toBe(true);
    expect('poop' in checks(after)).toBe(true);
    expect(after.currency.star).toBe(before.currency.star + 1);
    expect(ledgerOf(after, DAY)).toHaveLength(1);
    expect(healthState(after, DAY, NOW).poopIcons[2]).toEqual({ icon: '😣', current: true });
  });

  it('[HEALTH-12] 便便心情不在三个 emoji 里抛 RangeError', () => {
    expect(() => setHealth(seeded(), DAY, 'poopIcon', '🤢', NOW)).toThrow(RangeError);
    expect(() => setHealth(seeded(), DAY, 'poopIcon', '', NOW)).toThrow(RangeError);
  });

  it('[HEALTH-13] 填运动分钟数连带打开 exercise 并发放', () => {
    const before = seeded();
    const after = setHealth(before, DAY, 'exerciseMinutes', 30, NOW);

    expect(raw(after).exerciseMinutes).toBe(30);
    expect(raw(after).exercise).toBe(true);
    expect('exercise' in checks(after)).toBe(true);
    expect(after.currency.star).toBe(before.currency.star + 1);
  });

  it('[HEALTH-14] 已发放后再改分钟数：值变了，流水仍只有一条', () => {
    const first = setHealth(seeded(), DAY, 'exerciseMinutes', 30, NOW);
    const second = setHealth(first, DAY, 'exerciseMinutes', 45, NOW);

    expect(raw(second).exerciseMinutes).toBe(45);
    expect(raw(second).exercise).toBe(true);
    expect(ledgerOf(second, DAY)).toHaveLength(1);
    expect(second.currency.star).toBe(first.currency.star);
  });

  it('[HEALTH-15] 写入同值且蕴含开关已打开时原样返回', () => {
    const save = setHealth(seeded(), DAY, 'exerciseMinutes', 30, NOW);

    // 数字输入框每敲一下就触发一次，没有这条同一性页面每个按键都会写一次 storage
    expect(setHealth(save, DAY, 'exerciseMinutes', 30, NOW)).toBe(save);
    expect(setHealth(save, DAY, 'exerciseMinutes', '30', NOW)).toBe(save);

    const sugared = setHealth(seeded(), DAY, 'sugarCount', 4, NOW);
    expect(setHealth(sugared, DAY, 'sugarCount', 4, NOW)).toBe(sugared);
  });

  it('[HEALTH-15] 蕴含只打开不关闭：关掉 exercise 不清分钟数', () => {
    const on = setHealth(seeded(), DAY, 'exerciseMinutes', 30, NOW);
    const off = toggleHealth(on, DAY, 'exercise', NOW);

    expect(raw(off).exercise).toBe(false);
    expect(raw(off).exerciseMinutes).toBe(30);
  });

  it('[HEALTH-16] 传布尔字段抛 RangeError', () => {
    expect(() => setHealth(seeded(), DAY, 'vegetables', true, NOW)).toThrow(RangeError);
    expect(() => setHealth(seeded(), DAY, 'nothing', 1, NOW)).toThrow(RangeError);
  });

  it('[HEALTH-16] setHealth 的 now 非有限数抛 TypeError', () => {
    expect(() => setHealth(seeded(), DAY, 'sugarCount', 3, Number.NaN)).toThrow(TypeError);
  });
});

describe('洗澡的本周计数（HEALTH）', () => {
  it('[HEALTH-17] 本周打过两天时 bathWeek 为 { done: 2, target: 3 }', () => {
    let save = seeded();
    // 周一与周三各洗一次；周计数数的是 checks，不是 health.bath
    save = toggleHealth(save, '2026-08-10', 'bath', new Date(2026, 7, 10, 20, 0).getTime());
    save = toggleHealth(save, DAY, 'bath', NOW);

    expect(healthState(save, DAY, NOW).bathWeek).toEqual({ done: 2, target: 3 });
  });

  it('[HEALTH-17] 上一周洗的不算进本周', () => {
    const lastWeek = new Date(2026, 7, 9, 20, 0).getTime(); // 08-09 是上一周的周日
    const save = toggleHealth(seeded(), '2026-08-09', 'bath', lastWeek);

    expect(healthState(save, DAY, NOW).bathWeek).toEqual({ done: 0, target: 3 });
    expect(healthState(save, lastWeek, lastWeek).bathWeek).toEqual({ done: 1, target: 3 });
  });

  it('[HEALTH-18] 家长删掉洗澡任务：读取宽容、提交严格', () => {
    const save = seeded();
    const without = { ...save, habits: save.habits.filter((item) => item.id !== 'bath') };

    expect(() => healthState(without, DAY, NOW)).not.toThrow();
    expect(healthState(without, DAY, NOW).bathWeek).toBe(null);
    expect(() => toggleHealth(without, DAY, 'bath', NOW)).toThrow(RangeError);
    // 不连任务的字段不受影响
    expect(raw(toggleHealth(without, DAY, 'bathHair', NOW)).bathHair).toBe(true);
  });
});

describe('存档的不可变与兄弟键（HEALTH）', () => {
  it('[HEALTH-19] toggleHealth / setHealth 都不改入参', () => {
    const save = seeded();
    const snapshot = JSON.parse(JSON.stringify(save));

    toggleHealth(save, DAY, 'vegetables', NOW);
    setHealth(save, DAY, 'sugarCount', 5, NOW);
    setHealth(save, DAY, 'poopIcon', '😊', NOW);

    expect(save).toEqual(snapshot);
  });

  it('[HEALTH-20] 一次健康打卡后 checks / ledger / health 三个兄弟键同时在位', () => {
    const after = toggleHealth(seeded(), DAY, 'bath', NOW);
    const day = after.days[DAY];

    // 发放先行、记录后写，day 从 awarded 里取 —— 三处互不覆盖
    expect(Object.keys(day).sort()).toEqual(['checks', 'health', 'ledger']);
    expect(day.checks.bath.at).toBe(NOW);
    expect(day.ledger).toHaveLength(1);
    expect(day.health.bath).toBe(true);
  });
});
