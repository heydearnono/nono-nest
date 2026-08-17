import { describe, expect, it } from 'vitest';

import { weekKeys } from '../miniprogram/utils/dayKey.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import { checkAwardAndGrow } from '../miniprogram/utils/pet.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
import {
  achievementState,
  redeem,
  rewardState,
  settleDay,
  unlockAchievements,
} from '../miniprogram/utils/reward.js';
import { defaultSave, normalizeSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/reward/doc.md（`REWARD` / `ACHV` 两个区）
// 2026-08-12 是周三，本周是 08-10（周一）~ 08-16。

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 12, 0, 0, 0).getTime();
const WEEK = weekKeys(NOW);

/** 七条核心项，与 data/defaultHabits.js 的 `core: true` 一致 */
const CORE = ['wake', 'brush-am', 'literacy', 'reading', 'exercise', 'vegetables', 'poop'];

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 给存档一个勋章余额 */
function withMedal(save, medal) {
  return { ...save, currency: { ...save.currency, medal } };
}

/** 往某一天的记录里合并几个键（checks / bonuses / learning……） */
function withDay(save, key, patch) {
  const day = save.days?.[key] ?? {};
  return { ...save, days: { ...save.days, [key]: { ...day, ...patch } } };
}

/** 直接构造某几天的 `checks`，不走打卡（本区测的是判据，不是发放） */
function withChecks(save, keys, ids, at = NOW) {
  return keys.reduce((acc, key) => {
    const checks = { ...(acc.days?.[key]?.checks ?? {}) };
    for (const id of ids) checks[id] = { at };
    return withDay(acc, key, { checks });
  }, save);
}

/** 取某一条成就的那一行 */
function row(list, id) {
  return list.find((item) => item.id === id);
}

describe('兑换（REWARD）', () => {
  it('[REWARD-01] 空存档的三张卡片都买不起，兑换记录为空', () => {
    const state = rewardState(defaultSave(), DAY, NOW);

    expect(state.items.map((item) => item.id)).toEqual(['snack', 'cartoon', 'money']);
    expect(state.items.map((item) => item.affordable)).toEqual([false, false, false]);
    expect(state.redemptions).toEqual([]);
    expect(state.medal).toBe(0);
  });

  it('[REWARD-02] 勋章为 3 时只有 snack 与 cartoon 买得起', () => {
    const state = rewardState(withMedal(defaultSave(), 3), DAY, NOW);

    // affordable 由 rewardState 算好，页面不自己比 medal >= medalCost
    expect(state.items.map((item) => item.affordable)).toEqual([true, true, false]);
  });

  it('[REWARD-03] 申请兑换即扣勋章，记录落 pending 且在最前', () => {
    const next = redeem(withMedal(seeded(), 5), DAY, 'snack', NOW);

    expect(next.currency.medal).toBe(3);
    expect(next.redemptions).toHaveLength(1);
    expect(next.redemptions[0].status).toBe('pending');
  });

  it('[REWARD-04] 兑换写一条 spend 流水', () => {
    const next = redeem(withMedal(seeded(), 5), DAY, 'snack', NOW);

    expect(ledgerOf(next, DAY)).toEqual([
      { at: NOW, type: 'spend', reason: '兑换：零食一次', star: 0, gem: 0, petFood: 0, medal: 2 },
    ]);
  });

  it('[REWARD-05] 记录里的 name / icon / medalCost 是快照', () => {
    const next = redeem(withMedal(seeded(), 5), DAY, 'snack', NOW);

    expect(next.redemptions[0]).toEqual({
      at: NOW,
      rewardId: 'snack',
      name: '零食一次',
      icon: '🍪',
      medalCost: 2,
      status: 'pending',
    });

    // 快照的意义：家长将来改了价格，历史记录仍显示当时花了几枚。
    // 页面读的是这条记录，不回查 data/rewards.js —— 所以状态文案也在读取入口给
    const state = rewardState(next, DAY, NOW);
    expect(state.redemptions[0].statusText).toBe('待家长兑现');
  });

  it('[REWARD-06] 勋章不够时原样返回入参，不产生记录也不写流水', () => {
    const save = withMedal(seeded(), 1);
    const next = redeem(save, DAY, 'snack', NOW);

    // 对象同一性：勋章不够是正常状态（页面按 affordable 置灰），不是错误
    expect(next).toBe(save);
    expect(next.redemptions).toEqual([]);
    expect(ledgerOf(next, DAY)).toEqual([]);
  });

  it('[REWARD-07] 未登记的 rewardId 抛 RangeError', () => {
    // 与 REWARD-06 刻意不一致：按钮是 rewardState 渲染出来的，传别的值只可能是代码写错
    expect(() => redeem(withMedal(seeded(), 9), DAY, 'toy', NOW)).toThrow(RangeError);
  });

  it('[REWARD-08] now 非有限数抛 TypeError', () => {
    const save = withMedal(seeded(), 9);

    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, '现在']) {
      expect(() => redeem(save, DAY, 'snack', bad)).toThrow(TypeError);
    }
  });

  it('[REWARD-09] 连续兑换两次，两条记录最新在前，勋章共扣 4', () => {
    const once = redeem(withMedal(seeded(), 5), DAY, 'snack', NOW);
    const twice = redeem(once, DAY, 'snack', NOW + 1000);

    expect(twice.currency.medal).toBe(1);
    expect(twice.redemptions.map((item) => item.at)).toEqual([NOW + 1000, NOW]);
    expect(ledgerOf(twice, DAY)).toHaveLength(2);
  });

  it('[REWARD-10] redeem 不改传入的 save', () => {
    const save = withMedal(seeded(), 5);
    const snapshot = JSON.parse(JSON.stringify(save));

    redeem(save, DAY, 'snack', NOW);

    expect(JSON.parse(JSON.stringify(save))).toEqual(snapshot);
  });
});

describe('奖励结算（REWARD）', () => {
  it('[REWARD-11] settleDay 的顺序是全勤 → 周奖励 → 成就：同一次调用里 daily-3 已含今天', () => {
    // 前两天已全勤（水位为真），今天刚好打满第三天
    const past = withDay(
      withDay(seeded(), '2026-08-10', { bonuses: { allDone: true } }),
      '2026-08-11',
      {
        bonuses: { allDone: true },
      },
    );
    const today = withChecks(past, [DAY], CORE);
    const next = settleDay(today, DAY, NOW);

    // 全勤先跑，所以成就那一步数到的是「三天」而不是「两天」——
    // 顺序反过来的话孩子会看到「今天全勤了，但累计 3 天全勤的进度没动」
    expect(next.achievements).toContain('daily-3');
    // 勋章：全勤 1 枚 + daily-3 解锁 1 枚
    expect(next.currency.medal).toBe(2);
    expect(ledgerOf(next, DAY).map((e) => e.reason)).toEqual(['今日全勤', '解锁成就：打卡小能手']);
  });

  it('[REWARD-12] 无事可做时 settleDay 原样返回入参', () => {
    const save = seeded();

    expect(settleDay(save, DAY, NOW)).toBe(save);
    // 页面靠这条同一性判断「要不要落盘」
    expect(settleDay(defaultSave(), DAY, NOW)).toEqual(defaultSave());
  });

  it('[REWARD-13] checkAwardAndGrow 打上第七条核心项，同一次调用里勋章已 +1', () => {
    // 结算挂在打卡入口里：页面不必「先打卡再结算」两步走，
    // 四条打卡路径（自律、健康、学习表单、识字）因此一起接上
    const six = withChecks(seeded(), [DAY], CORE.slice(0, 6));
    const next = checkAwardAndGrow(six, DAY, 'poop', NOW);

    expect(next.currency.medal).toBe(1);
    expect(next.days[DAY].bonuses.allDone).toBe(true);
  });

  it('[REWARD-14] settleDay 的 now 非有限数抛 TypeError', () => {
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, '现在']) {
      expect(() => settleDay(seeded(), DAY, bad)).toThrow(TypeError);
    }
  });

  it('[REWARD-15] redemptions 有脏元素时 rewardState 不抛错', () => {
    // 存档可能被手改或被旧版本写坏：读取入口宽容（渲染宽容），收敛由 SAVE-15 做
    const save = normalizeSave({
      redemptions: [{ rewardId: 'snack', name: '零食一次', medalCost: -2, status: 'weird' }, '坏'],
    });
    const state = rewardState(save, DAY, NOW);

    expect(state.redemptions).toHaveLength(1);
    expect(state.redemptions[0].statusText).toBe('待家长兑现');
    // 数组被整体写坏（不是数组）时也只是显示不出记录，不影响能不能打开页面
    expect(rewardState({ ...save, redemptions: 42 }, DAY, NOW).redemptions).toEqual([]);
  });

  it('[REWARD-16] 家长停用的卡不出现在 items 里；缺键 = 启用，未知 id 被忽略', () => {
    const off = { ...defaultSave(), rewardFlags: { snack: false } };

    expect(rewardState(off, DAY, NOW).items.map((item) => item.id)).toEqual(['cartoon', 'money']);

    // 三种「没被明确停用」都是三条全在 —— 判 `!== false` 而不是判真值，
    // 否则存档里还没有这个键的用户一张卡都换不了（SAVE-23）
    for (const flags of [{}, { snack: true }, { cartoon: true }]) {
      expect(rewardState({ ...defaultSave(), rewardFlags: flags }, DAY, NOW).items).toHaveLength(3);
    }
    expect(rewardState(defaultSave(), DAY, NOW).items).toHaveLength(3);

    // 未知 id 在存档里留着（本层不删数据），但不会凭空多一张卡
    const withUnknown = { ...defaultSave(), rewardFlags: { zzz: false } };
    expect(rewardState(withUnknown, DAY, NOW).items.map((item) => item.id)).toEqual([
      'snack',
      'cartoon',
      'money',
    ]);
  });

  it('[REWARD-17] 卡被停用时 redeem 原样返回入参，不扣勋章不产生记录也不抛错', () => {
    const save = { ...withMedal(seeded(), 9), rewardFlags: { snack: false } };
    const next = redeem(save, DAY, 'snack', NOW);

    // 停用是家长刚在另一个页面按下的开关，页面这一侧的列表可能还是上一次渲染的 ——
    // 那是竞态不是编程错误，所以与 REWARD-06 同一策略（返回入参），不像 REWARD-07 抛错
    expect(next).toBe(save);
    expect(next.currency.medal).toBe(9);
    expect(next.redemptions).toEqual([]);
    expect(ledgerOf(next, DAY)).toEqual([]);
    // 另外两条照常能换
    expect(redeem(save, DAY, 'cartoon', NOW).currency.medal).toBe(6);
  });

  it('rewardState 的顶部数据：今日几条核心项、本周达标几天、这周发过没有', () => {
    const save = withChecks(seeded(), WEEK.slice(0, 5), CORE.slice(0, 5));
    const state = rewardState(withChecks(save, [DAY], CORE), DAY, NOW);

    expect(state.coreTotal).toBe(7);
    expect(state.coreDone).toBe(7);
    expect(state.weekBonus).toEqual({ days: 5, minDays: 5, done: false });
    expect(state.allDone).toBe(false); // 还没结算，水位是假
  });
});

describe('成就（ACHV）', () => {
  it('[ACHV-01] 空存档的十一行全未解锁，进度除 pet-5 外全 0', () => {
    const list = achievementState(defaultSave(), DAY, NOW);

    expect(list).toHaveLength(11);
    expect(list.every((item) => item.unlocked === false)).toBe(true);
    // pet-5 是 1 而不是 0：宠物等级的初始值就是 1 级，进度条显示 1/5 是对的。
    // 把它按到 0 得给这一条单独减 1 —— 那就是同一份数据两套口径
    expect(row(list, 'pet-5').progress).toBe(1);
    expect(list.filter((item) => item.id !== 'pet-5').every((item) => item.progress === 0)).toBe(
      true,
    );
    // 常量表加了行却忘写判据的话，这一条会抛 RangeError 而不是静默返回 0
    expect(row(list, 'char-50').threshold).toBe(50);
  });

  it('[ACHV-02] 连续三天打上 wake 后解锁 early-bird，勋章 +1 并写流水', () => {
    const save = withChecks(seeded(), ['2026-08-10', '2026-08-11', DAY], ['wake']);
    const next = unlockAchievements(save, DAY, NOW);

    expect(next.achievements).toEqual(['early-bird']);
    expect(next.currency.medal).toBe(1);
    // 解锁的勋章进流水（线上不进，于是「流水加起来等于余额」在线上不成立）
    expect(ledgerOf(next, DAY).at(-1)).toEqual({
      at: NOW,
      type: 'earn',
      reason: '解锁成就：早起小明星',
      star: 0,
      gem: 0,
      petFood: 0,
      medal: 1,
    });
  });

  it('[ACHV-03] 已解锁后再结算一次，原样返回且不重复发放', () => {
    const save = withChecks(seeded(), ['2026-08-10', '2026-08-11', DAY], ['wake']);
    const once = unlockAchievements(save, DAY, NOW);
    const twice = unlockAchievements(once, DAY, NOW + 1000);

    expect(twice).toBe(once);
    expect(twice.currency.medal).toBe(1);
  });

  it('[ACHV-04] 一次结算同时够两条成就，两条都解锁、勋章 +2、流水两条', () => {
    const chars = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`字${i}`, { step: 0, due: '', wrong: 0 }]),
    );
    const save = {
      ...seeded(),
      pet: { ...seeded().pet, petLevel: 5 },
      learningProgress: { literacy: { chars } },
    };
    const next = unlockAchievements(save, DAY, NOW);

    expect(next.achievements).toEqual(['char-50', 'pet-5']);
    expect(next.currency.medal).toBe(2);
    expect(ledgerOf(next, DAY).map((e) => e.reason)).toEqual([
      '解锁成就：识字小达人',
      '解锁成就：宠物好朋友',
    ]);
  });

  it('[ACHV-05] 50 个 step 为 0 的字就解锁 char-50 —— 数「学过」不是「已掌握」', () => {
    // 本仓库的已掌握要熬完六个间隔跨 58 天，照线上数 masteredChars 这条头两个月不可达
    const chars = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`字${i}`, { step: 0, due: '', wrong: 0 }]),
    );
    const save = { ...seeded(), learningProgress: { literacy: { chars } } };

    expect(row(achievementState(save, DAY, NOW), 'char-50').progress).toBe(50);
    expect(unlockAchievements(save, DAY, NOW).achievements).toEqual(['char-50']);
  });

  it('[ACHV-06] learningProgress 缺 guoxue / math 子键时两条进度为 0 且不抛错', () => {
    // 古诗与数学那两轮把子键加上就自动亮起来 —— 判据照样跑，不是不可达代码
    const list = achievementState(seeded(), DAY, NOW);

    expect(row(list, 'poem-10').progress).toBe(0);
    expect(row(list, 'math-10').progress).toBe(0);
    expect(() => achievementState({}, DAY, NOW)).not.toThrow();

    // P5 古诗接上 guoxue 子键后 poem-10 自己就动了 —— reward.js 一行没改。
    // 判据读的是存档上的 mastered，所以它不必知道古诗的档位表（不能 import poem.js，会成环）
    const poems = Object.fromEntries(
      Array.from({ length: 3 }, (_, i) => [`p${i + 1}`, { step: 5, due: '', mastered: true }]),
    );
    const save = { ...seeded(), learningProgress: { guoxue: { poems } } };
    expect(row(achievementState(save, DAY, NOW), 'poem-10').progress).toBe(3);

    // math-10 也要一条非空进度的断言：只断言「缺子键时是 0」的话，判据把字段名
    // 写成 learningProgress.math.games（本仓库叫 rounds）也照样通过 —— 本轮就是这么
    // 溜过去的（doc.md 那段回顾、`MATH-36`）。空进度的断言必须配一条非空的
    const rounds = Object.fromEntries(
      Array.from({ length: 4 }, (_, i) => [`m1-${i + 1}`, { correct: true, wrong: 0 }]),
    );
    const withMath = { ...seeded(), learningProgress: { math: { rounds, stage: 1 } } };
    expect(row(achievementState(withMath, DAY, NOW), 'math-10').progress).toBe(4);

    // 答错过但没答对的题不算 —— 数的是「答对过哪些题」，不是「答了几次」
    const wrongOnly = {
      ...seeded(),
      learningProgress: { math: { rounds: { 'm1-1': { correct: false, wrong: 7 } }, stage: 1 } },
    };
    expect(row(achievementState(wrongOnly, DAY, NOW), 'math-10').progress).toBe(0);
  });

  it('[ACHV-07] 本周五天打上 vegetables 解锁 veggie-5', () => {
    const save = withChecks(seeded(), WEEK.slice(0, 5), ['vegetables']);

    expect(row(achievementState(save, DAY, NOW), 'veggie-5').progress).toBe(5);
    expect(unlockAchievements(save, DAY, NOW).achievements).toContain('veggie-5');
  });

  it('[ACHV-08] 跨两个月共五天打上 room，tidy-5 进度为 5（累计，不限本周）', () => {
    const keys = ['2026-07-03', '2026-07-20', '2026-08-01', '2026-08-09', DAY];
    const save = withChecks(seeded(), keys, ['room']);

    expect(row(achievementState(save, DAY, NOW), 'tidy-5').progress).toBe(5);
  });

  it('[ACHV-09] 本周达标五天时 full-week 进度为 1（与周奖励共用达标日判据）', () => {
    // 与 POINT-30 是同一个判据的两个读取点：两条都在，挡住给成就再写一套「达标」算法
    const save = withChecks(seeded(), WEEK.slice(0, 5), CORE.slice(0, 5));

    expect(row(achievementState(save, DAY, NOW), 'full-week').progress).toBe(1);
    // 只有四天达标时是 0
    const four = withChecks(seeded(), WEEK.slice(0, 4), CORE.slice(0, 5));
    expect(row(achievementState(four, DAY, NOW), 'full-week').progress).toBe(0);
  });

  it('[ACHV-10] pet.petLevel 为 5 时解锁 pet-5', () => {
    const save = { ...seeded(), pet: { ...seeded().pet, petLevel: 5 } };

    expect(row(achievementState(save, DAY, NOW), 'pet-5').progress).toBe(5);
    expect(unlockAchievements(save, DAY, NOW).achievements).toEqual(['pet-5']);
  });

  it('[ACHV-11] 三天 bonuses.allDone 为真时解锁 daily-3', () => {
    const save = ['2026-08-10', '2026-08-11', DAY].reduce(
      (acc, key) => withDay(acc, key, { bonuses: { allDone: true } }),
      seeded(),
    );

    expect(row(achievementState(save, DAY, NOW), 'daily-3').progress).toBe(3);
    expect(unlockAchievements(save, DAY, NOW).achievements).toEqual(['daily-3']);
  });

  it('[ACHV-12] brush-am 连续六天后断一天、又打两天，进度为 2 且未解锁', () => {
    const six = [
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ];
    // 08-10 断掉，08-11 与 08-12 又打上 —— 连续中断即归零，从今天往前只数到两天
    const save = withChecks(seeded(), [...six, '2026-08-11', DAY], ['brush-am']);
    const list = achievementState(save, DAY, NOW);

    expect(row(list, 'brush-7').progress).toBe(2);
    expect(row(list, 'brush-7').unlocked).toBe(false);
  });

  it('[ACHV-13] veggie-5 解锁后进入下一周，进度回落但仍是已解锁', () => {
    const save = withChecks(seeded(), WEEK.slice(0, 5), ['vegetables']);
    const unlocked = unlockAchievements(save, DAY, NOW);
    expect(unlocked.achievements).toContain('veggie-5');

    // 下周三：本周一条 vegetables 都没有，进度回到 0
    const nextWeek = new Date(2026, 7, 19, 12, 0, 0, 0).getTime();
    const later = row(achievementState(unlocked, '2026-08-19', nextWeek), 'veggie-5');

    // 成就是「达成过」的记录，不是当前状态 —— 撤销会让「解锁」这件事没有意义
    expect(later.progress).toBe(0);
    expect(later.unlocked).toBe(true);
  });

  it('[ACHV-14] achievements 里有脏值时不抛错，十一条仍全未解锁', () => {
    const save = { ...seeded(), achievements: ['a', 'a', 7, null] };
    const list = achievementState(save, DAY, NOW);

    expect(list.every((item) => item.unlocked === false)).toBe(true);
    // 数组被整体写坏也只影响数值
    expect(() =>
      achievementState({ ...seeded(), achievements: 'early-bird' }, DAY, NOW),
    ).not.toThrow();
  });

  it('[ACHV-15] unlockAchievements 的 now 非有限数抛 TypeError', () => {
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, '现在']) {
      expect(() => unlockAchievements(seeded(), DAY, bad)).toThrow(TypeError);
    }
  });

  it('[ACHV-16] unlockAchievements 不改入参；无成就可解锁时返回入参本身', () => {
    const save = withChecks(seeded(), ['2026-08-10', '2026-08-11', DAY], ['wake']);
    const snapshot = JSON.parse(JSON.stringify(save));

    unlockAchievements(save, DAY, NOW);
    expect(JSON.parse(JSON.stringify(save))).toEqual(snapshot);

    const nothing = seeded();
    expect(unlockAchievements(nothing, DAY, NOW)).toBe(nothing);
  });
});
