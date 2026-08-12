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

    // 顶层键与默认存档完全一致：线上多出来的 9 个键（pointRules、rewardRules、
    // medalProgress、learningProgress、stickerCollection……）本层不接
    expect(Object.keys(result).sort()).toEqual(Object.keys(defaultSave()).sort());

    expect(result.currency).toEqual({ star: 42, gem: 2, petFood: 11, medal: 6 });
    expect(result.childName).toBe('Nono');
    expect(result.habits).toHaveLength(1);
    expect(result.habits[0].id).toBe('wake');
    expect(result.days['2026-08-11'].completedTasks).toEqual({ wake: true });
    expect(result.redemptions[0].rewardId).toBe('snack');
    expect(result.achievements).toEqual(['early-bird']);
    expect(result.parent).toEqual({ pin: '4321', dailyGoal: 8, note: '暑假加一项阅读' });

    // ISO 字符串换成毫秒数，且能 JSON 往返不变形
    expect(result.createdAt).toBe(Date.parse('2026-06-01T02:00:00.000Z'));
    expect(result.updatedAt).toBe(Date.parse('2026-08-11T09:30:00.000Z'));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
