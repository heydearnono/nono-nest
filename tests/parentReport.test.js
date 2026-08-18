import { describe, expect, it } from 'vitest';

import { dayKey, weekKeys } from '../miniprogram/utils/dayKey.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import { boardState, dailyReport } from '../miniprogram/utils/parentReport.js';
import { dayEarned } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/parent/doc.md（`PARENT` 区第三段 `PARENT-54` ~ `71`）
// 按 AGENTS.md 第 13 条：本文件的两个函数都是**读取入口**，所以每一条断言的
// 都是「读取入口的输出」—— 它们一个字都不写盘（写入口在 parentTasks.js）。
//
// 2026-08-14 是周五，本周是 08-10（周一）~ 08-16（周日）。
const NOW = new Date(2026, 7, 14, 20, 0, 0, 0).getTime();
const KEY = dayKey(NOW);
const WEEK = weekKeys(NOW);

/** 七条核心项，与 data/defaultHabits.js 的 `core: true` 一致 */
const CORE = ['wake', 'brush-am', 'literacy', 'reading', 'exercise', 'vegetables', 'poop'];

/** 一份已填好默认任务表的存档（18 条全启用，没有任何一天的记录） */
function seeded() {
  return seedHabits(defaultSave());
}

/** 往某一天的记录里合并几个键（checks / ledger / learning……） */
function withDay(save, key, patch) {
  const day = save.days?.[key] ?? {};
  return { ...save, days: { ...save.days, [key]: { ...day, ...patch } } };
}

/** 直接构造某一天的 `checks`，不走打卡 —— 本区测的是读取口径，不是发放 */
function withChecks(save, key, ids, at = NOW) {
  const checks = { ...(save.days?.[key]?.checks ?? {}) };
  for (const id of ids) checks[id] = { at };
  return withDay(save, key, { checks });
}

/**
 * 停用某几条任务。**不经 `saveHabit`** —— 那会把本文件的绿灯绑在另一个模块的
 * 正确性上，而这里要断言的只是「读取入口怎么数」。
 */
function disable(save, ids) {
  return {
    ...save,
    habits: save.habits.map((h) => (ids.includes(h.id) ? { ...h, enabled: false } : h)),
  };
}

/** 改 `dailyGoal`（goal 与 total 是两个数，PARENT-56 要它们不相等） */
function withGoal(save, dailyGoal) {
  return { ...save, parent: { ...save.parent, dailyGoal } };
}

/** 造 `count` 个学过的字，其中前 `mastered` 个已掌握（step >= 7） */
function withChars(save, count, mastered) {
  const chars = {};
  for (let i = 0; i < count; i += 1) {
    chars[`字${i}`] = { step: i < mastered ? 7 : 3, due: '', wrong: 0 };
  }
  return {
    ...save,
    learningProgress: { ...save.learningProgress, literacy: { chars } },
  };
}

describe('看板 boardState', () => {
  it('[PARENT-54] 一条记录都没有的存档：今日四个数与三条趋势全落零', () => {
    const state = boardState(seeded(), NOW);

    expect(state.today.done).toBe(0);
    // goal 是 dailyGoal 的默认值，total 是启用中的任务总数 —— 两个数都不等于 done
    expect(state.today.goal).toBe(6);
    expect(state.today.met).toBe(false);
    expect(state.today.total).toBe(18);
    expect(state.week.days).toHaveLength(7);
    expect(state.trends.habit).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(state.trends.learning).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(state.trends.health).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('[PARENT-55] 打了 5 条其中一条已停用：done 数 4、total 数 17', () => {
    const save = disable(withChecks(seeded(), KEY, ['wake', 'brush-am', 'dress', 'toys', 'room']), [
      'room',
    ]);
    const state = boardState(save, NOW);

    // 停用的那条打卡记录仍在存档里，但两个数都不含它 —— 与 dailyReport 同一个口径
    expect(save.days[KEY].checks.room).toBeDefined();
    expect(state.today.done).toBe(4);
    expect(state.today.total).toBe(17);
  });

  it('[PARENT-56] dailyGoal 为 4 且完成 4 条：met 为 true，goal 与 total 是两个数', () => {
    const save = withGoal(withChecks(seeded(), KEY, ['wake', 'brush-am', 'dress', 'toys']), 4);
    const state = boardState(save, NOW);

    expect(state.today.done).toBe(4);
    expect(state.today.goal).toBe(4);
    expect(state.today.met).toBe(true);
    // 把 met 写成 done >= total 的实现在 PARENT-54 里也是 false，只有这一条能挡住它
    expect(state.today.total).toBe(18);
  });

  it('[PARENT-57] week.days 七条，键与 weekKeys 逐个相等，today 只有一条为 true', () => {
    const state = boardState(seeded(), NOW);

    expect(state.week.days.map((row) => row.key)).toEqual(WEEK);
    expect(state.week.days.map((row) => row.today)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    // 星期文案由 utils 给，页面不自己映射
    expect(state.week.days.map((row) => row.weekday)).toEqual([
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
      '日',
    ]);
  });

  it('[PARENT-58] 只有今天有记录：另六条 hasRecord 为 false（不是 0/18）', () => {
    const state = boardState(withChecks(seeded(), KEY, ['wake']), NOW);
    const today = state.week.days.find((row) => row.today);

    expect(today.hasRecord).toBe(true);
    expect(state.week.days.filter((row) => row.hasRecord)).toHaveLength(1);
    // 没有记录的那天 done 仍是 0，但 hasRecord 说明这个 0 是「没有数据」——
    // 页面据此显示「—」而不是 0/18（缺陷 13）
    for (const row of state.week.days.filter((item) => !item.today)) {
      expect(row.done).toBe(0);
      expect(row.total).toBe(18);
    }
  });

  it('[PARENT-59] 三天核心项打满、两天只打 2 条：qualifiedDays 为 3', () => {
    let save = seeded();
    for (const key of WEEK.slice(0, 3)) save = withChecks(save, key, CORE.slice(0, 5));
    for (const key of WEEK.slice(3, 5)) save = withChecks(save, key, CORE.slice(0, 2));
    const state = boardState(save, NOW);

    // 复用 isQualifiedDay，不新造第四个「本周」口径（线上三套同叫本周，缺陷 11）
    expect(state.week.qualifiedDays).toBe(3);
    expect(state.week.minDays).toBe(5);
    expect(state.week.bonusDone).toBe(false);
    expect(state.week.days.map((row) => row.qualified)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('[PARENT-60] habit 类 9 条完成 3 条为 33，health 类一条都没启用落 0', () => {
    const save = disable(withChecks(seeded(), KEY, ['wake', 'brush-am', 'brush-pm']), [
      'exercise',
      'vegetables',
      'poop',
      'bath',
    ]);
    const state = boardState(save, NOW);
    const index = WEEK.indexOf(KEY);

    expect(state.trends.habit[index]).toBe(33);
    // 「零个里完成了零个」没有百分比，而柱子高度必须是个数（照线上 Sr）
    expect(state.trends.health[index]).toBe(0);
  });

  it('[PARENT-61] trends 三条数组长度都是 7，下标与 week.days 一一对应', () => {
    const state = boardState(withChecks(seeded(), WEEK[1], ['wake']), NOW);

    for (const category of ['habit', 'learning', 'health']) {
      expect(state.trends[category]).toHaveLength(state.week.days.length);
      expect(state.trends[category]).toHaveLength(7);
    }
    // 周二那天 habit 类 9 条完成 1 条 → 11%，其余六天为 0：下标就是 week.days 的下标
    expect(state.trends.habit).toEqual([0, 11, 0, 0, 0, 0, 0]);
  });

  it('[PARENT-62] 30 个字学过其中 7 个已掌握：两个数都给', () => {
    const state = boardState(withChars(seeded(), 30, 7), NOW);

    expect(state.totals.charsLearned).toBe(30);
    expect(state.totals.charsMastered).toBe(7);
  });

  it('[PARENT-63] 三天各读 20 / 30 / 40 分钟：readMinutes 为 90（遍历 days 现算）', () => {
    let save = seeded();
    for (const [i, minutes] of [20, 30, 40].entries()) {
      save = withDay(save, WEEK[i], { learning: { reading: { minutes } } });
    }
    const state = boardState(save, NOW);

    // 存档里没有累计字段 —— 线上那个 reading.totalMinutes 恒为 0（缺陷 16）
    expect(state.totals.readMinutes).toBe(90);
    expect(save.learningProgress.reading).toBeUndefined();
    expect(state.totals.days).toBe(3);
  });
});

describe('每日报告 dailyReport', () => {
  it('[PARENT-64] 空的一天：done 为 0、doneList 为空、todoList 是全部启用任务', () => {
    const report = dailyReport(seeded(), KEY);

    expect(report.key).toBe(KEY);
    expect(report.done).toBe(0);
    expect(report.doneList).toEqual([]);
    expect(report.todoList).toHaveLength(18);
    expect(report.sentences).toEqual(['今天还没有完成记录，明天一起加油！']);
    expect(report.learning).toEqual({});
  });

  it('[PARENT-65] 打了 3 条其中一条已停用：两张列表都不含它，done 为 2', () => {
    const save = disable(withChecks(seeded(), KEY, ['wake', 'brush-am', 'room']), ['room']);
    const report = dailyReport(save, KEY);

    expect(report.done).toBe(2);
    expect(report.doneList.map((habit) => habit.id)).toEqual(['wake', 'brush-am']);
    expect(report.todoList.map((habit) => habit.id)).not.toContain('room');
    // 打卡记录仍在存档里：家长把任务开回来它就回来了（软删除的同一条）
    expect(save.days[KEY].checks.room).toBeDefined();
    expect(dailyReport({ ...save, habits: seeded().habits }, KEY).done).toBe(3);
  });

  it('[PARENT-66] 两张列表构成划分，done 就是前者的长度', () => {
    const cases = [
      seeded(),
      withChecks(seeded(), KEY, ['wake']),
      disable(withChecks(seeded(), KEY, CORE), ['poop', 'bath']),
      withChecks(
        seeded(),
        KEY,
        seeded().habits.map((habit) => habit.id),
      ),
    ];

    for (const save of cases) {
      const report = dailyReport(save, KEY);
      const enabled = save.habits.filter((habit) => habit.enabled).length;

      // 三个数一个来源：线上那三个数各数一次，两张表加起来既可能多于也可能少于总数（缺陷 14）
      expect(report.doneList.length + report.todoList.length).toBe(enabled);
      expect(report.done).toBe(report.doneList.length);
    }
  });

  it('[PARENT-67] 一条都没完成时 todoList 是 18 条，不截断', () => {
    const report = dailyReport(seeded(), KEY);

    // 线上 .slice(0, 8) 且不提示，本仓库页面能滚
    expect(report.todoList).toHaveLength(18);
  });

  it('[PARENT-68] 只完成早上刷牙：句子里不出现「早晚」', () => {
    const report = dailyReport(withChecks(seeded(), KEY, ['brush-am']), KEY);
    const text = report.sentences.join('');

    expect(text).toContain('早上刷牙');
    // 线上写死 brush-am 却说「早晚刷牙」（缺陷 15）—— 那是报告里说一件没发生的事
    expect(text).not.toContain('早晚');
    expect(text).not.toContain('晚上刷牙');
  });

  it('[PARENT-69] 当天学了两个字：多一句识字，learning 只给当天有的子键', () => {
    const save = withDay(withChecks(seeded(), KEY, ['literacy']), KEY, {
      learning: { literacy: { newChars: ['天', '地'] } },
    });
    const report = dailyReport(save, KEY);

    expect(report.sentences).toHaveLength(2);
    expect(report.sentences[0]).toBe('今天完成了 1 项：识字。');
    expect(report.sentences[1]).toBe('识字学了「天」「地」。');
    // 没有的子键不出现 —— 凭空补一个空 reading 会让「那天有没有阅读」多出一个假答案
    expect(Object.keys(report.learning)).toEqual(['literacy']);
  });

  it('[PARENT-70] 当天两条流水、宠物等级 3：currency 走 dayEarned，pet 是快照', () => {
    const save = withDay({ ...seeded(), pet: { ...seeded().pet, petLevel: 3, mood: 5 } }, KEY, {
      ledger: [
        { at: NOW, type: 'earn', reason: '打卡：按时起床', star: 1, gem: 0, petFood: 1, medal: 0 },
        { at: NOW, type: 'spend', reason: '兑换：小零食', star: 0, gem: 0, petFood: 0, medal: 3 },
      ],
    });
    const report = dailyReport(save, KEY);

    // 「今天挣了多少」全仓只有一个算法，本模块不重算
    expect(report.currency).toEqual(dayEarned(save, KEY));
    expect(report.currency).toEqual({ star: 1, gem: 0, petFood: 1, medal: -3 });
    expect(report.pet).toEqual({ petLevel: 3, mood: 5 });
  });

  it('[PARENT-71] days 里没有这个键：不抛错，等同空的一天', () => {
    const save = withChecks(seeded(), KEY, ['wake']);

    expect(() => dailyReport(save, '2020-01-01')).not.toThrow();

    const report = dailyReport(save, '2020-01-01');
    expect(report.key).toBe('2020-01-01');
    expect(report.done).toBe(0);
    expect(report.todoList).toHaveLength(18);
    expect(report.currency).toEqual({ star: 0, gem: 0, petFood: 0, medal: 0 });
  });
});
