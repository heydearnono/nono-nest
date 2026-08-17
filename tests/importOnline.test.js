import { describe, expect, it } from 'vitest';

import { importOnlineSave } from '../miniprogram/utils/importOnline.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/storage/doc.md（`IMPORT` 区）
describe('importOnlineSave 的字段映射', () => {
  it('[IMPORT-01] currency 的四个键改名，数值不变', () => {
    const result = importOnlineSave({
      currency: { stars: 128, gems: 3, foodPoints: 17, medals: 9 },
    });

    expect(result.currency).toEqual({ star: 128, gem: 3, petFood: 17, medal: 9 });
  });

  it('[IMPORT-02] pet 的 satiety/happiness/level/exp 改名，刻度不换', () => {
    const result = importOnlineSave({
      pet: { type: 'fox', name: '小狐狸', level: 4, exp: 350, satiety: 5, happiness: 2 },
    });

    expect(result.pet).toEqual({
      type: 'fox',
      name: '小狐狸',
      petLevel: 4,
      petExp: 350,
      fullness: 5,
      mood: 2,
      // 线上没有这个字段，落 0 —— 见 IMPORT-10
      lastFedAt: 0,
    });
  });

  it('[IMPORT-03] profile.name 提到顶层 childName', () => {
    const result = importOnlineSave({ profile: { name: 'Nono', avatarEmoji: '🦄' } });

    expect(result.childName).toBe('Nono');
    expect(result.childAvatar).toBe('🦄');
    expect('profile' in result).toBe(false);
  });

  it('[IMPORT-04] dailyRecords 的日期键原样成为 days 的键', () => {
    const aug10 = { date: '2026-08-10', completedTasks: { wake: true }, ledger: [] };
    const aug11 = { date: '2026-08-11', completedTasks: { 'brush-am': true }, ledger: [] };

    const result = importOnlineSave({ dailyRecords: { '2026-08-10': aug10, '2026-08-11': aug11 } });

    expect(Object.keys(result.days)).toEqual(['2026-08-10', '2026-08-11']);
    expect(result.days['2026-08-10']).toEqual(aug10);
  });

  it('[IMPORT-05] unlockedMedals 成为 achievements', () => {
    const result = importOnlineSave({ unlockedMedals: ['early-bird'] });

    expect(result.achievements).toEqual(['early-bird']);
    expect('unlockedMedals' in result).toBe(false);
  });

  it('[IMPORT-06] pet.unlockedDecor 被丢弃', () => {
    const result = importOnlineSave({ pet: { level: 2, unlockedDecor: ['hat', 'scarf'] } });

    expect('unlockedDecor' in result.pet).toBe(false);
  });
});

describe('importOnlineSave 的边界', () => {
  it('[IMPORT-07] 空对象等于 defaultSave()，不抛错', () => {
    expect(importOnlineSave({})).toEqual(defaultSave());
  });

  it('[IMPORT-08] 非对象输入抛 TypeError', () => {
    for (const raw of [undefined, null, 0, 'x', [], true]) {
      expect(() => importOnlineSave(raw)).toThrow(TypeError);
    }
  });

  it('[IMPORT-09] createdAt 的 ISO 字符串转成毫秒数', () => {
    const result = importOnlineSave({
      createdAt: '2026-06-01T02:00:00.000Z',
      updatedAt: '2026-08-11T09:30:00.000Z',
    });

    expect(result.createdAt).toBe(Date.parse('2026-06-01T02:00:00.000Z'));
    expect(result.updatedAt).toBe(Date.parse('2026-08-11T09:30:00.000Z'));

    // 已经是毫秒数就原样保留；解析不出来的字符串退回默认值 0
    expect(importOnlineSave({ createdAt: 1_700_000_000_000 }).createdAt).toBe(1_700_000_000_000);
    expect(importOnlineSave({ createdAt: '不是日期' }).createdAt).toBe(0);
  });

  it('[IMPORT-10] pet.lastFedAt 落 0 —— 线上没有这个字段', () => {
    // 线上侧就算硬塞一个同名字段也不该被采信：映射表里没有它的来源行
    expect(importOnlineSave({}).pet.lastFedAt).toBe(0);
    expect(importOnlineSave({ pet: { satiety: 5, lastFedAt: 1754880000000 } }).pet.lastFedAt).toBe(
      0,
    );
  });
});

// 线上「导出数据」的真实结构（从线上 bundle 的初始 state 逐字段抄来，
// 只把 dailyRecords / unlockedMedals 填了内容，好断言透传）
const ONLINE_EXPORT = {
  version: 1,
  profile: { name: 'Nono', avatarEmoji: '👧' },
  currency: { stars: 42, foodPoints: 11, gems: 2, medals: 6 },
  pet: {
    type: 'unicorn',
    name: '彩虹',
    level: 1,
    exp: 0,
    satiety: 3,
    happiness: 4,
    unlockedDecor: [],
  },
  tasks: [
    {
      id: 'wake',
      name: '按时起床',
      icon: '🌅',
      category: 'habit',
      frequency: 'daily',
      starsReward: 1,
      foodPointsReward: 1,
      needsParentConfirm: false,
      enabled: true,
      sortOrder: 1,
    },
  ],
  dailyRecords: {
    '2026-08-11': {
      date: '2026-08-11',
      completedTasks: { wake: true },
      learning: {},
      health: {},
      ledger: [{ type: 'earn', stars: 1, reason: '按时起床' }],
    },
  },
  pointRules: {
    learning: { stars: 2, foodPoints: 2 },
    habit: { stars: 1, foodPoints: 1 },
    health: { stars: 1, foodPoints: 1 },
    weeklyBonus: { stars: 5, gems: 1, minDays: 5 },
  },
  rewardRules: [{ id: 'snack', name: '零食一次', icon: '🍪', medalCost: 2 }],
  exchangeRecords: [{ id: 'r1', rewardId: 'snack', status: 'approved' }],
  parentSettings: { pin: '4321', dailyGoal: 8, note: '暑假加一项阅读' },
  unlockedMedals: ['early-bird'],
  medalProgress: { 'early-bird': 1 },
  learningProgress: {
    guoxue: { learnedPoems: [], masteredPoems: [], reviewSchedule: {} },
    literacy: {
      learnedChars: ['天'],
      reviewChars: [],
      masteredChars: [],
      charReviewSchedule: {},
      charWrongCounts: {},
    },
    math: { currentStage: 1, gamesCompleted: 0, stagePlayed: 0, stageCorrect: 0 },
    english: { streak: 0 },
    reading: { totalMinutes: 0, books: [] },
  },
  soundEnabled: true,
  stickerCollection: {},
  lastFreeStickerDate: '',
  lastWeeklyBonusWeek: '',
  createdAt: '2026-06-01T02:00:00.000Z',
  updatedAt: '2026-08-11T09:30:00.000Z',
};

describe('importOnlineSave 对真实线上导出的端到端行为', () => {
  it('[IMPORT-01] 一份完整线上导出 JSON 得到形状正确的存档', () => {
    const result = importOnlineSave(ONLINE_EXPORT);

    // 顶层键与默认存档完全一致：线上多出来的 8 个键（pointRules、rewardRules、
    // medalProgress、stickerCollection……）本层不接。learningProgress 只接 literacy 与 guoxue 两支
    expect(Object.keys(result).sort()).toEqual(Object.keys(defaultSave()).sort());

    expect(result.currency).toEqual({ star: 42, gem: 2, petFood: 11, medal: 6 });
    expect(result.childName).toBe('Nono');
    expect(result.habits).toHaveLength(1);
    expect(result.habits[0].id).toBe('wake');
    // 只断言长度与 id 挡不住「元素里每个字段都是错的」：P7 第二段之前这里是整份透传，
    // 上面两条全过而 starsReward 没改名、core 全缺席（教训与 P5 数学的 math_games 同形）。
    // 元素映射至少要断言一个**改了名的字段**与一个**本仓库独有的字段**
    expect(result.habits[0].starReward).toBe(1);
    expect(result.habits[0].core).toBe(false);
    expect(result.days['2026-08-11'].completedTasks).toEqual({ wake: true });
    expect(result.redemptions[0].rewardId).toBe('snack');
    expect(result.achievements).toEqual(['early-bird']);
    expect(result.parent).toEqual({
      pin: '4321',
      dailyGoal: 8,
      note: '暑假加一项阅读',
      // 线上没有这两个，落 normalizeSave 的默认值（IMPORT-16）
      pinFails: 0,
      pinLockedUntil: 0,
    });

    // ISO 字符串换成毫秒数，且能 JSON 往返不变形
    expect(result.createdAt).toBe(Date.parse('2026-06-01T02:00:00.000Z'));
    expect(result.updatedAt).toBe(Date.parse('2026-08-11T09:30:00.000Z'));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('[IMPORT-11] 线上识字的五个结构映射成一张 chars 表', () => {
    const result = importOnlineSave({
      learningProgress: {
        literacy: {
          // 线上一次评分写六个到期日，到期判定是 some(d <= today) —— 只有最早那个说话
          charReviewSchedule: {
            天: ['2026-08-13', '2026-08-14', '2026-08-16', '2026-08-19'],
            木: ['2026-09-11', '2026-08-20'],
          },
          masteredChars: ['的', '一'],
          reviewChars: ['天', '是'],
          learnedChars: ['天', '的', '在'],
          charWrongCounts: { 天: 3, 一: 1 },
        },
      },
    });

    expect(result.learningProgress.literacy.chars).toEqual({
      // 线上的已掌握直接认，不打回重学（哪怕 charWrongCounts 里还有它）
      的: { step: 7, due: '', wrong: 0 },
      一: { step: 7, due: '', wrong: 1 },
      // 有调度的取那六个日期里最早的一个，不是数组里的第一个
      天: { step: 0, due: '2026-08-13', wrong: 3 },
      木: { step: 0, due: '2026-08-20', wrong: 0 },
      // 只在列表里的推不出档位，按「学过、立刻到期」算 —— 空串小于任何日期键
      是: { step: 0, due: '', wrong: 0 },
      在: { step: 0, due: '', wrong: 0 },
    });

    // 线上同层的 reading / english 永久不接（在线上就是死字段）；
    // guoxue 由 IMPORT-14 接走，math 由 IMPORT-15 接走 —— learningProgress 到此接完
    expect(Object.keys(result.learningProgress)).toEqual(['literacy', 'guoxue', 'math']);
    // 线上没有识字进度时是一张空表，不抛错
    expect(importOnlineSave({}).learningProgress.literacy.chars).toEqual({});
    expect(
      importOnlineSave({ learningProgress: { literacy: 42 } }).learningProgress.literacy.chars,
    ).toEqual({});
  });

  it('[IMPORT-12] exchangeRecords 的三种状态映射成两种，rejected 整条丢掉', () => {
    const result = importOnlineSave({
      exchangeRecords: [
        {
          id: 'r1',
          rewardId: 'snack',
          rewardName: '零食一次',
          medalCost: 2,
          status: 'approved',
          requestedAt: '2026-08-11T09:30:00.000Z',
          resolvedAt: '2026-08-11T10:00:00.000Z',
        },
        { id: 'r2', rewardId: 'cartoon', rewardName: '动画片1集', medalCost: 3, status: 'pending' },
        { id: 'r3', rewardId: 'money', rewardName: '5元零花钱', medalCost: 5, status: 'rejected' },
      ],
    });

    // rejected 丢掉：本仓库没有「已取消」这个状态，留着它就是一条永远不会兑现的条目
    expect(result.redemptions).toEqual([
      {
        at: Date.parse('2026-08-11T09:30:00.000Z'),
        rewardId: 'snack',
        name: '零食一次',
        // 线上元素没有 icon（兑换记录页回查 rewardRules），快照里落空串
        icon: '',
        medalCost: 2,
        status: 'done',
      },
      { at: 0, rewardId: 'cartoon', name: '动画片1集', icon: '', medalCost: 3, status: 'pending' },
    ]);
    // 线上的 id / resolvedAt 都不迁移
    expect('id' in result.redemptions[0]).toBe(false);
    expect('resolvedAt' in result.redemptions[0]).toBe(false);
    expect(importOnlineSave({}).redemptions).toEqual([]);
  });

  it('[IMPORT-13] lastWeeklyBonusWeek 原样落进同名顶层键，线上无此键时落空串', () => {
    expect(importOnlineSave({ lastWeeklyBonusWeek: '2026-08-10' }).lastWeeklyBonusWeek).toBe(
      '2026-08-10',
    );
    expect(importOnlineSave({}).lastWeeklyBonusWeek).toBe('');
    // 线上那份空串（从未发过周奖励）导入后仍是空串
    expect(importOnlineSave(ONLINE_EXPORT).lastWeeklyBonusWeek).toBe('');
  });

  it('[IMPORT-14] 线上古诗的三个结构映射成一张 poems 表，weekly 落空水位', () => {
    const result = importOnlineSave({
      learningProgress: {
        guoxue: {
          // 线上一次写六个到期日，到期判定是 some(d <= today) —— 只有最早那个说话
          reviewSchedule: {
            p3: ['2026-08-13', '2026-08-14', '2026-08-16', '2026-08-19'],
            p4: ['2026-09-11', '2026-08-20'],
          },
          masteredPoems: ['p1', 'p2'],
          learnedPoems: ['p3', 'p5'],
        },
      },
    });

    expect(result.learningProgress.guoxue.poems).toEqual({
      // 线上的已会背直接认，不打回重熬。step 5 是古诗的顶档（不是识字的 7）
      p1: { step: 5, due: '', wrong: 0, mastered: true },
      p2: { step: 5, due: '', wrong: 0, mastered: true },
      // 有调度的取那六个日期里最早的一个，不是数组里的第一个
      p3: { step: 0, due: '2026-08-13', wrong: 0, mastered: false },
      p4: { step: 0, due: '2026-08-20', wrong: 0, mastered: false },
      // 只在列表里的按「学过、立刻到期」算 —— 空串小于任何日期键
      p5: { step: 0, due: '', wrong: 0, mastered: false },
    });

    // weekly 不从线上来：线上的本周三首是每次现算的（floor(天序号/7)*3 % 109），没有字段可搬
    expect(result.learningProgress.guoxue.weekly).toEqual({ weekKey: '', ids: [] });

    // 线上没有古诗进度时是一张空表，不抛错
    expect(importOnlineSave({}).learningProgress.guoxue.poems).toEqual({});
    expect(
      importOnlineSave({ learningProgress: { guoxue: 42 } }).learningProgress.guoxue.poems,
    ).toEqual({});
    // 线上那份空进度（三个结构都是空的）导入后是空表
    expect(importOnlineSave(ONLINE_EXPORT).learningProgress.guoxue).toEqual({
      poems: {},
      weekly: { weekKey: '', ids: [] },
    });
  });

  it('[IMPORT-15] 线上数学只接 currentStage，三个次数字段都不接', () => {
    const result = importOnlineSave({
      learningProgress: {
        math: { currentStage: 4, gamesCompleted: 37, stagePlayed: 5, stageCorrect: 3 },
      },
    });

    // 只接阶段。三个次数字段数的是「答了几次」，本仓库数的是「答对过哪些题」——
    // 次数换不出题目，而且线上那三个数可以无限刷（每答一题就 +1、无去重）
    expect(result.learningProgress.math).toEqual({ rounds: {}, stage: 4 });

    // 越界的 currentStage 由 normalizeSave 夹（1 ~ 6）
    expect(
      importOnlineSave({ learningProgress: { math: { currentStage: 99 } } }).learningProgress.math
        .stage,
    ).toBe(6);

    // 线上没有数学进度时落默认水位，不抛错
    expect(importOnlineSave({}).learningProgress.math).toEqual({ rounds: {}, stage: 1 });
    expect(importOnlineSave({ learningProgress: { math: 42 } }).learningProgress.math).toEqual({
      rounds: {},
      stage: 1,
    });
    // 线上那份初始进度（currentStage 为 1）导入后仍是第一阶段
    expect(importOnlineSave(ONLINE_EXPORT).learningProgress.math).toEqual({
      rounds: {},
      stage: 1,
    });
  });

  it('[IMPORT-16] 线上 parentSettings 三个字段原样映射，两个 PIN 水位都落 0', () => {
    const result = importOnlineSave({
      parentSettings: { pin: '9876', dailyGoal: 4, note: '周末不查作业' },
    });

    expect(result.parent).toEqual({
      pin: '9876',
      dailyGoal: 4,
      note: '周末不查作业',
      pinFails: 0,
      pinLockedUntil: 0,
    });

    // dailyGoal 的上界在本层夹（线上那道 Math.min(12, …) 在设置页里，导入绕得过去）
    expect(importOnlineSave({ parentSettings: { dailyGoal: 99 } }).parent.dailyGoal).toBe(12);

    // 线上就算写了这两个字段也不接 —— 它们是本仓库的水位，不从别人的存档里来
    expect(
      importOnlineSave({ parentSettings: { pinFails: 4, pinLockedUntil: 1e12 } }).parent,
    ).toEqual({ pin: '1234', dailyGoal: 6, note: '', pinFails: 0, pinLockedUntil: 0 });

    // 线上没有 parentSettings 时整块落默认值，不抛错
    expect(importOnlineSave({}).parent).toEqual(defaultSave().parent);
    expect(importOnlineSave({ parentSettings: 42 }).parent).toEqual(defaultSave().parent);
  });

  it('[IMPORT-17] 线上 tasks 逐元素映射：两个产出值改名、subCategory 不接、core 落 false', () => {
    const result = importOnlineSave({
      tasks: [
        {
          id: 'literacy',
          name: '识字练习',
          icon: '📖',
          category: 'learning',
          frequency: 'daily',
          starsReward: 2,
          foodPointsReward: 2,
          subCategory: 'chinese',
          needsParentConfirm: false,
          enabled: true,
          sortOrder: 4,
          module: 'literacy',
        },
        {
          id: 'bath',
          name: '洗澡',
          icon: '🛁',
          category: 'health',
          frequency: 'weekly',
          weeklyTarget: 3,
          starsReward: 1,
          foodPointsReward: 1,
        },
      ],
    });

    expect(result.habits[0]).toEqual({
      id: 'literacy',
      name: '识字练习',
      icon: '📖',
      category: 'learning',
      frequency: 'daily',
      // 改名的两个：线上叫 starsReward / foodPointsReward
      starReward: 2,
      petFoodReward: 2,
      needsParentConfirm: false,
      enabled: true,
      sortOrder: 4,
      // 线上没有「今日全勤名单」这个概念，落 false —— 不按 id 猜
      core: false,
      module: 'literacy',
    });
    // 线上只写不读的字段不接
    expect('subCategory' in result.habits[0]).toBe(false);
    expect('starsReward' in result.habits[0]).toBe(false);
    expect('foodPointsReward' in result.habits[0]).toBe(false);

    // weeklyTarget 只在 frequency: 'weekly' 时保留（条件字段，收敛层管）
    expect(result.habits[1].weeklyTarget).toBe(3);
    expect('module' in result.habits[1]).toBe(false);

    // 线上没有 tasks 时落空数组，不抛错
    expect(importOnlineSave({}).habits).toEqual([]);
    expect(importOnlineSave({ tasks: 42 }).habits).toEqual([]);
  });

  it('[IMPORT-18] rewardFlags 整份不接，线上 rewardRules 的 medalCost 不进存档', () => {
    const result = importOnlineSave(ONLINE_EXPORT);

    // 线上三条卡默认全 enabled: true，映射过来恒等于「缺键 = 启用」——
    // 不接一个没有信息量的映射（与 pinFails 那三条不同：那是线上没有数据）
    expect(result.rewardFlags).toEqual({});
    // 就算线上明确停用了一条也不接：卡的定义留在 data/rewards.js，改价不做
    expect(
      importOnlineSave({ rewardRules: [{ id: 'snack', medalCost: 9, enabled: false }] })
        .rewardFlags,
    ).toEqual({});
    expect(JSON.stringify(result)).not.toContain('medalCost":9');
  });
});
