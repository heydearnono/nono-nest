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

  it('[SAVE-13] learningProgress.literacy.chars 默认为空对象，坏值被收敛', () => {
    expect(defaultSave().learningProgress.literacy.chars).toEqual({});
    expect(normalizeSave({}).learningProgress.literacy.chars).toEqual({});
    expect(normalizeSave({ learningProgress: 42 }).learningProgress.literacy.chars).toEqual({});

    const dirty = normalizeSave({
      learningProgress: {
        literacy: {
          chars: {
            的: { step: 99, due: '2026-08-20', wrong: -3 },
            一: { step: -1, due: '昨天', wrong: 2.6 },
            是: { step: '2', due: '', wrong: undefined },
            天: '坏记录',
          },
        },
      },
    });

    // step 夹到 0~7、due 只认 YYYY-MM-DD 形状（其余落空串）、wrong 夹成非负整数
    expect(dirty.learningProgress.literacy.chars).toEqual({
      的: { step: 7, due: '2026-08-20', wrong: 0 },
      一: { step: 0, due: '', wrong: 3 },
      是: { step: 0, due: '', wrong: 0 },
      天: { step: 0, due: '', wrong: 0 },
    });
  });

  it('[SAVE-17] learningProgress.guoxue 的默认值、step 上界 5 与 mastered 的仲裁', () => {
    const empty = { poems: {}, weekly: { weekKey: '', ids: [] } };

    expect(defaultSave().learningProgress.guoxue).toEqual(empty);
    expect(normalizeSave({}).learningProgress.guoxue).toEqual(empty);
    expect(normalizeSave({ learningProgress: 42 }).learningProgress.guoxue).toEqual(empty);

    const dirty = normalizeSave({
      learningProgress: {
        guoxue: {
          poems: {
            // 古诗的上界是 5 不是 7：夹到 7 说明两个 feature 的档位表被混成了一张
            p1: { step: 99, due: '2026-08-20', wrong: -3, mastered: false },
            // mastered 与 step 矛盾时以 step 为准（本层照 step 现算，不原样收下）
            p2: { step: 2, due: '昨天', wrong: 2.6, mastered: true },
            p3: { step: '5', due: '', wrong: undefined, mastered: true },
            p4: '坏记录',
          },
          weekly: { weekKey: '2026-W33', ids: ['p1', 7, null, 'p2'] },
        },
      },
    });

    expect(dirty.learningProgress.guoxue.poems).toEqual({
      p1: { step: 5, due: '2026-08-20', wrong: 0, mastered: true },
      p2: { step: 2, due: '', wrong: 3, mastered: false },
      p3: { step: 0, due: '', wrong: 0, mastered: false },
      p4: { step: 0, due: '', wrong: 0, mastered: false },
    });

    // weekKey 只认 YYYY-MM-DD 形状，ids 只留字符串（脏 id 由 poemState 在渲染时挑掉）
    expect(dirty.learningProgress.guoxue.weekly).toEqual({ weekKey: '', ids: ['p1', 'p2'] });

    const clean = normalizeSave({
      learningProgress: { guoxue: { weekly: { weekKey: '2026-08-10', ids: ['p1', 'p2', 'p3'] } } },
    });

    // 合法水位原样保留：改写它等于每天重选本周三首
    expect(clean.learningProgress.guoxue.weekly).toEqual({
      weekKey: '2026-08-10',
      ids: ['p1', 'p2', 'p3'],
    });
  });

  it('[SAVE-18] learningProgress.math 的默认值、stage 夹 1~6 与 rounds 的两个字段', () => {
    const empty = { rounds: {}, stage: 1 };

    expect(defaultSave().learningProgress.math).toEqual(empty);
    expect(normalizeSave({}).learningProgress.math).toEqual(empty);
    expect(normalizeSave({ learningProgress: 42 }).learningProgress.math).toEqual(empty);

    // stage 的上界是 6（阶段数），下界是 1 —— 这不是第三个档位上界，数学没有间隔表
    expect(
      normalizeSave({ learningProgress: { math: { stage: 99 } } }).learningProgress.math.stage,
    ).toBe(6);
    expect(
      normalizeSave({ learningProgress: { math: { stage: -1 } } }).learningProgress.math.stage,
    ).toBe(1);
    expect(
      normalizeSave({ learningProgress: { math: { stage: '2' } } }).learningProgress.math.stage,
    ).toBe(1);

    const dirty = normalizeSave({
      learningProgress: {
        math: {
          rounds: {
            'm1-1': { correct: true, wrong: -3 },
            // correct 只认布尔：truthy 的字符串不算「答对过」
            'm1-2': { correct: 'yes', wrong: 2.6 },
            'm1-3': { wrong: undefined },
            'm1-4': '坏记录',
          },
          stage: 3,
        },
      },
    });

    // 非对象的记录整条丢掉（与 chars / poems 那两处「补成空记录」不同：
    // 那两处的记录只有数值字段、补空是安全的，而这里 correct 补 false 会把
    // 「答对过」悄悄改成「没答对过」—— 丢掉让 mathState 当它不存在，语义一致）
    expect(dirty.learningProgress.math.rounds).toEqual({
      'm1-1': { correct: true, wrong: 0 },
      'm1-2': { correct: false, wrong: 3 },
      'm1-3': { correct: false, wrong: 0 },
    });
    expect(dirty.learningProgress.math.stage).toBe(3);
  });

  it('[SAVE-19] parent 的三个设置项与两个 PIN 水位：默认值、dailyGoal 上界 12、脏值收敛', () => {
    const empty = { pin: '1234', dailyGoal: 6, note: '', pinFails: 0, pinLockedUntil: 0 };

    expect(defaultSave().parent).toEqual(empty);
    expect(normalizeSave({}).parent).toEqual(empty);
    expect(normalizeSave({ parent: 42 }).parent).toEqual(empty);

    // dailyGoal 的上界从 +∞ 收到 12（线上只在设置页夹，导入绕得过去）
    expect(normalizeSave({ parent: { dailyGoal: 99 } }).parent.dailyGoal).toBe(12);
    expect(normalizeSave({ parent: { dailyGoal: 0 } }).parent.dailyGoal).toBe(1);
    expect(normalizeSave({ parent: { dailyGoal: '8' } }).parent.dailyGoal).toBe(6);

    // pinFails 是水位：夹到 0 ~ 5 只是不让脏存档撑大数字
    expect(normalizeSave({ parent: { pinFails: -3 } }).parent.pinFails).toBe(0);
    expect(normalizeSave({ parent: { pinFails: 99 } }).parent.pinFails).toBe(5);
    expect(normalizeSave({ parent: { pinFails: 3 } }).parent.pinFails).toBe(3);

    // pinLockedUntil 是毫秒时间戳，非负、无上界
    expect(normalizeSave({ parent: { pinLockedUntil: -1 } }).parent.pinLockedUntil).toBe(0);
    expect(normalizeSave({ parent: { pinLockedUntil: 1e13 } }).parent.pinLockedUntil).toBe(1e13);

    // note 允许空串（str 的第三个参数），pin 不允许
    expect(normalizeSave({ parent: { note: '', pin: '' } }).parent).toEqual({
      ...empty,
      note: '',
      pin: '1234',
    });
  });
});

describe('周奖励的水位与两个数组的元素收敛', () => {
  it('[SAVE-14] lastWeeklyBonusWeek 缺失或非日期键形状时落空串', () => {
    // 空串的含义是「从未发过周奖励」：'' !== 本周周键 天然成立，第一周不需要特判
    expect(defaultSave().lastWeeklyBonusWeek).toBe('');
    expect(normalizeSave({}).lastWeeklyBonusWeek).toBe('');
    expect(normalizeSave({ lastWeeklyBonusWeek: '2026-W33' }).lastWeeklyBonusWeek).toBe('');
    expect(normalizeSave({ lastWeeklyBonusWeek: 1754880000000 }).lastWeeklyBonusWeek).toBe('');
    // 合法的周键原样保留，否则周奖励会每天重发
    expect(normalizeSave({ lastWeeklyBonusWeek: '2026-08-10' }).lastWeeklyBonusWeek).toBe(
      '2026-08-10',
    );
  });

  it('[SAVE-15] redemptions 的脏元素被收敛，非对象的整条丢掉', () => {
    const result = normalizeSave({
      redemptions: [
        {
          at: 1754880000000,
          rewardId: 'snack',
          name: '零食一次',
          icon: '🍪',
          medalCost: -2,
          status: 'weird',
          resolvedAt: '2026-08-11T09:30:00.000Z',
        },
        '坏记录',
        null,
        42,
      ],
    });

    // status 落 'pending' 而不是 'done'：坏数据宁愿留在待兑现列表里让家长看见
    expect(result.redemptions).toEqual([
      {
        at: 1754880000000,
        rewardId: 'snack',
        name: '零食一次',
        icon: '🍪',
        medalCost: 0,
        status: 'pending',
      },
    ]);
    // 未知字段被丢弃
    expect('resolvedAt' in result.redemptions[0]).toBe(false);
    // 合法的 'done' 不被改写
    expect(normalizeSave({ redemptions: [{ status: 'done' }] }).redemptions[0].status).toBe('done');
  });

  it('[SAVE-16] achievements 去重且只留字符串', () => {
    expect(normalizeSave({ achievements: ['a', 'a', 7, null] }).achievements).toEqual(['a']);
    expect(normalizeSave({ achievements: 'early-bird' }).achievements).toEqual([]);
    expect(defaultSave().achievements).toEqual([]);
  });
});

describe('habits 的元素收敛与兑换卡开关（P7 第二段）', () => {
  it('[SAVE-20] habits 的脏元素被逐字段收敛，未知字段丢弃', () => {
    const result = normalizeSave({
      habits: [
        {
          id: 'wake',
          name: '  ',
          icon: '',
          category: 'weird',
          starReward: 99,
          petFoodReward: -3,
          enabled: 'yes',
          core: 1,
          sortOrder: -2,
          subCategory: 'chinese',
        },
      ],
    });

    expect(result.habits).toEqual([
      {
        id: 'wake',
        // 全空白的名字落 '未命名'：空白名字在首页是一格看不见的按钮
        name: '未命名',
        icon: '⭐',
        // 坏 category 落 'habit' 而不是 'learning'：learning 类要配 module，
        // 落过去会让一条没有 module 的任务进学习入口页的查找路径
        category: 'habit',
        frequency: 'daily',
        // 上界 10 不是防溢出是防通胀；下界 0 是合法值（只记录不奖励）
        starReward: 10,
        petFoodReward: 0,
        needsParentConfirm: false,
        // 坏值落 true：不明不白地少一格比多一格更难发现（分母跟着变）
        enabled: true,
        sortOrder: 0,
        // 1 不是 true：只有严格布尔 true 才算核心任务
        core: false,
      },
    ]);
    // 线上的 subCategory 本仓库没有这个概念，收敛时丢弃
    expect('subCategory' in result.habits[0]).toBe(false);
    // 合法值原样保留，不会被夹坏
    expect(
      normalizeSave({
        habits: [
          { id: 'wake', category: 'health', frequency: 'weekly', enabled: false, core: true },
        ],
      }).habits[0],
    ).toMatchObject({ category: 'health', frequency: 'weekly', enabled: false, core: true });
  });

  it('[SAVE-21] id 坏的元素整条丢掉，重复 id 只留第一条', () => {
    const result = normalizeSave({
      habits: [
        { id: '', name: '空 id' },
        { id: 42, name: '非字符串 id' },
        { name: '缺 id' },
        '坏元素',
        null,
        { id: 'wake', name: '按时起床' },
        { id: 'wake', name: '重复的那条' },
      ],
    });

    // 没有 id 的任务打不了卡（checks 按 id 存）也改不了（saveHabit 按 id 找）；
    // 重复 id 会共享同一个打卡状态，界面上是「点一个亮两个」
    expect(result.habits).toHaveLength(1);
    expect(result.habits[0].name).toBe('按时起床');
  });

  it('[SAVE-22] module 与 weeklyTarget 是条件字段，缺席保持缺席', () => {
    const result = normalizeSave({
      habits: [
        { id: 'poem', category: 'learning', module: 'guoxue' },
        { id: 'wake', category: 'habit', module: 'guoxue' },
        { id: 'bath', frequency: 'weekly', weeklyTarget: 3 },
        { id: 'brush', frequency: 'daily', weeklyTarget: 3 },
      ],
    });
    const [poem, wake, bath, brush] = result.habits;

    // 无条件补默认值会让 18 条里 13 条多一个 module: ''，
    // 而 habitOf 用 find(item => item.module === module) 找任务
    expect(poem.module).toBe('guoxue');
    expect('module' in wake).toBe(false);
    expect('weeklyTarget' in bath).toBe(true);
    expect(bath.weeklyTarget).toBe(3);
    expect('weeklyTarget' in brush).toBe(false);
    // learning 类但 module 是坏值：也缺席，不落空串
    expect(
      'module' in normalizeSave({ habits: [{ id: 'x', category: 'learning' }] }).habits[0],
    ).toBe(false);
  });

  it('[SAVE-23] rewardFlags 默认空对象，值收敛成布尔，未知 id 留着', () => {
    // 空对象 = 三条全启用（缺键 = 启用），所以默认值里不预写三个 true
    expect(defaultSave().rewardFlags).toEqual({});
    expect(normalizeSave({}).rewardFlags).toEqual({});

    expect(
      normalizeSave({ rewardFlags: { snack: 0, cartoon: 'x', money: false, zzz: true } })
        .rewardFlags,
    ).toEqual({
      snack: false,
      cartoon: true,
      money: false,
      // 未知 id 原样留着：本层零 import，认不出哪个 id 登记过；
      // 删了就丢数据，忽略它是 utils/reward.js 的事（REWARD-16）
      zzz: true,
    });

    expect(normalizeSave({ rewardFlags: ['snack'] }).rewardFlags).toEqual({});
    expect(normalizeSave({ rewardFlags: null }).rewardFlags).toEqual({});
    expect(normalizeSave({ rewardFlags: 'snack' }).rewardFlags).toEqual({});
  });

  it("[SAVE-24] redemptions 的 status 认第三个取值 'cancelled'，坏值仍落 'pending'", () => {
    const statusOf = (status) => normalizeSave({ redemptions: [{ status }] }).redemptions[0].status;

    // P7 第三段加的第三个取值：家长驳回后落它
    expect(statusOf('cancelled')).toBe('cancelled');
    expect(statusOf('pending')).toBe('pending');
    expect(statusOf('done')).toBe('done');

    // 坏值一律落 'pending'。**不落 'cancelled'** —— 那个状态的语义是「退过款了」，
    // 把一条认不出状态的记录说成退过款，等于凭空承认一笔没发生的退款
    for (const bad of ['rejected', 'approved', 'weird', '', 'CANCELLED', 42, null, undefined]) {
      expect(statusOf(bad)).toBe('pending');
    }
  });

  it('[SAVE-25] stickerCollection 键存在即拥有：0 与负数整条丢掉，未知 id 留着', () => {
    expect(defaultSave().stickerCollection).toEqual({});
    expect(normalizeSave({}).stickerCollection).toEqual({});

    const collection = normalizeSave({
      stickerCollection: {
        'st-000-小狗狗': 3.7,
        'st-001-小猫咪': 0,
        'st-002-小兔子': -2,
        'st-003-小熊熊': 'x',
        zzz: 2,
      },
    }).stickerCollection;

    // 值取整
    expect(collection['st-000-小狗狗']).toBe(3);

    // 0 / 负数 / 非数那三个键**整条不存在**：键存在即拥有，值只用来数几次。
    // 线上页面判 `> 0` 说明收藏册里会有 0；丢掉之后读取侧只需判「键在不在」
    expect('st-001-小猫咪' in collection).toBe(false);
    expect('st-002-小兔子' in collection).toBe(false);
    expect('st-003-小熊熊' in collection).toBe(false);

    // 未知 id 原样留着：本层零 import，认不出哪个 id 在 data/stickers.js 里登记过。
    // 忽略它是 utils/sticker.js 的读取路径的事（STICKER-06）—— 与 SAVE-23 逐字同一条
    expect(collection.zzz).toBe(2);

    expect(normalizeSave({ stickerCollection: ['st-000-小狗狗'] }).stickerCollection).toEqual({});
    expect(normalizeSave({ stickerCollection: null }).stickerCollection).toEqual({});
    expect(normalizeSave({ stickerCollection: 'st-000-小狗狗' }).stickerCollection).toEqual({});
  });

  it('[SAVE-26] lastFreeStickerDate 只认日期键形状，其余落空串', () => {
    expect(defaultSave().lastFreeStickerDate).toBe('');
    expect(normalizeSave({}).lastFreeStickerDate).toBe('');

    expect(normalizeSave({ lastFreeStickerDate: '2026-08-17' }).lastFreeStickerDate).toBe(
      '2026-08-17',
    );

    // 落空串的后果是「今天可能再免费抽一次」，落一个乱码的后果是
    // 「'乱码' !== 今天 恒成立 —— 每天都能抽，而且永远抽不完」
    for (const bad of ['乱码', '2026-8-17', '2026-08-17T00:00:00', 20260817, null, undefined]) {
      expect(normalizeSave({ lastFreeStickerDate: bad }).lastFreeStickerDate).toBe('');
    }
  });
});
