import { describe, expect, it } from 'vitest';

import { dayKey } from '../miniprogram/utils/dayKey.js';
import {
  check,
  dayProgress,
  habitStreak,
  isChecked,
  listHabits,
  seedHabits,
  uncheck,
} from '../miniprogram/utils/habit.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/habit/doc.md（`HABIT` 区）

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 本机时区某天的中午，避免贴着 0 点的构造让断言依赖时区 */
function noon(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

describe('默认任务表与筛选', () => {
  it('[HABIT-01] seedHabits 填入 18 条，sortOrder 从 1 起连续', () => {
    const save = seeded();

    expect(save.habits).toHaveLength(18);
    expect(save.habits.map((h) => h.sortOrder)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );

    const byCategory = (name) => save.habits.filter((h) => h.category === name).length;
    expect(byCategory('habit')).toBe(9);
    expect(byCategory('learning')).toBe(5);
    expect(byCategory('health')).toBe(4);
  });

  it('[HABIT-02] habits 非空时原样返回，不覆盖家长改过的清单', () => {
    const custom = { ...defaultSave(), habits: [{ id: 'only', category: 'habit', enabled: true }] };

    expect(seedHabits(custom)).toBe(custom);
    expect(seedHabits(custom).habits).toHaveLength(1);
  });

  it('[HABIT-03] listHabits 只给 9 条 habit，按 sortOrder 升序', () => {
    const shuffled = seeded();
    shuffled.habits.reverse();

    const list = listHabits(shuffled);

    expect(list).toHaveLength(9);
    expect(list.every((h) => h.category === 'habit')).toBe(true);
    expect(list.map((h) => h.id)).toEqual([
      'wake',
      'brush-am',
      'brush-pm',
      'dress',
      'toys',
      'room',
      'desk',
      'bag',
      'sleep',
    ]);
  });

  it('[HABIT-04] enabled 为 false 的项不出现在 listHabits 里', () => {
    const save = seeded();
    save.habits.find((h) => h.id === 'sleep').enabled = false;

    expect(listHabits(save).map((h) => h.id)).not.toContain('sleep');
    expect(listHabits(save)).toHaveLength(8);
  });
});

describe('打卡与取消', () => {
  const KEY = '2026-08-12';
  const NOW = noon(2026, 8, 12);

  it('[HABIT-05] check 写入 checks 与打卡时刻', () => {
    const save = check(seeded(), KEY, 'wake', NOW);

    expect(save.days[KEY].checks.wake).toEqual({ at: NOW });
    expect(isChecked(save, KEY, 'wake')).toBe(true);
  });

  it('[HABIT-06] 连续 check 两次幂等，at 保持第一次的值', () => {
    const once = check(seeded(), KEY, 'wake', NOW);
    const twice = check(once, KEY, 'wake', NOW + 60_000);

    expect(twice).toBe(once);
    expect(twice.days[KEY].checks.wake.at).toBe(NOW);
  });

  it('[HABIT-07] uncheck 删键，不留 completed: false 的墓碑', () => {
    const checked = check(seeded(), KEY, 'wake', NOW);
    const result = uncheck(checked, KEY, 'wake');

    expect('wake' in result.days[KEY].checks).toBe(false);
    expect(isChecked(result, KEY, 'wake')).toBe(false);
  });

  it('[HABIT-08] uncheck 没打过的项原样返回，不抛错', () => {
    const save = seeded();

    expect(uncheck(save, KEY, 'wake')).toBe(save);
    expect(() => uncheck(save, KEY, 'wake')).not.toThrow();
  });

  it('[HABIT-09] 不存在的 habitId 抛 RangeError', () => {
    const save = seeded();

    expect(() => check(save, KEY, 'nope', NOW)).toThrow(RangeError);
    expect(() => uncheck(save, KEY, 'nope')).toThrow(RangeError);
  });

  it('[HABIT-10] check / uncheck 不改传入的 save', () => {
    const save = seeded();
    const snapshot = JSON.parse(JSON.stringify(save));

    const checked = check(save, KEY, 'wake', NOW);
    expect(save).toEqual(snapshot);
    expect(save.days[KEY]).toBeUndefined();

    uncheck(checked, KEY, 'wake');
    expect(checked.days[KEY].checks.wake).toEqual({ at: NOW });
  });

  it('[HABIT-17] check 的 now 非有限数抛 TypeError', () => {
    const save = seeded();

    expect(() => check(save, KEY, 'wake', Number.NaN)).toThrow(TypeError);
    expect(() => check(save, KEY, 'wake', '123')).toThrow(TypeError);
    expect(() => check(save, KEY, 'wake', undefined)).toThrow(TypeError);
  });

  it('保留当天记录里的其它键（ledger 等由后续 feature 增补）', () => {
    const save = seeded();
    save.days[KEY] = { ledger: [{ star: 1 }] };

    const result = check(save, KEY, 'wake', NOW);

    expect(result.days[KEY].ledger).toEqual([{ star: 1 }]);
    expect(result.days[KEY].checks.wake).toEqual({ at: NOW });
  });
});

describe('进度', () => {
  const KEY = '2026-08-12';
  const NOW = noon(2026, 8, 12);

  it('[HABIT-11] 9 项中打了 2 项', () => {
    let save = seeded();
    save = check(save, KEY, 'wake', NOW);
    save = check(save, KEY, 'dress', NOW);

    expect(dayProgress(save, KEY)).toEqual({ done: 2, total: 9 });
  });

  it('[HABIT-12] days 里没有该日期键时 done 为 0', () => {
    expect(dayProgress(seeded(), '2026-01-01')).toEqual({ done: 0, total: 9 });
  });

  it('total 随停用项减少，否则进度到不了满格', () => {
    const save = seeded();
    save.habits.find((h) => h.id === 'sleep').enabled = false;

    expect(dayProgress(save, KEY).total).toBe(8);
  });

  it('learning / health 的打卡不计入首页进度', () => {
    const save = check(seeded(), KEY, 'literacy', NOW);

    expect(dayProgress(save, KEY)).toEqual({ done: 0, total: 9 });
  });
});

describe('连续天数', () => {
  /** 把若干天各打一项 wake，返回存档 */
  function checkedOn(days) {
    let save = seeded();
    for (const ms of days) {
      save = check(save, dayKey(ms), 'wake', ms);
    }
    return save;
  }

  it('[HABIT-13] 今天与前两天各有打卡时为 3', () => {
    const today = noon(2026, 8, 12);
    const save = checkedOn([today, noon(2026, 8, 11), noon(2026, 8, 10)]);

    expect(habitStreak(save, today)).toBe(3);
  });

  it('[HABIT-14] 今天一项未打时为 0，即使昨天打过', () => {
    const today = noon(2026, 8, 12);
    const save = checkedOn([noon(2026, 8, 11)]);

    expect(habitStreak(save, today)).toBe(0);
  });

  it('[HABIT-15] 昨天空、前天打过时为 1，断点即止', () => {
    const today = noon(2026, 8, 12);
    const save = checkedOn([today, noon(2026, 8, 10)]);

    expect(habitStreak(save, today)).toBe(1);
  });

  it('[HABIT-16] 连续 40 天都打过时封顶 30', () => {
    const today = noon(2026, 8, 12);
    const days = [];
    for (let i = 0; i < 40; i += 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.getTime());
    }

    expect(habitStreak(checkedOn(days), today)).toBe(30);
  });

  it('跨月与跨年时日期回溯不出错', () => {
    const jan1 = noon(2026, 1, 1);
    const save = checkedOn([jan1, noon(2025, 12, 31), noon(2025, 12, 30)]);

    expect(habitStreak(save, jan1)).toBe(3);
  });
});
