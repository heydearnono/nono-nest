import { describe, expect, it } from 'vitest';

import { REWARDS } from '../miniprogram/data/rewards.js';
import { listHabits, seedHabits } from '../miniprogram/utils/habit.js';
import {
  addHabit,
  moveHabit,
  parentTasks,
  resolveRedemption,
  saveHabit,
  toggleReward,
} from '../miniprogram/utils/parentTasks.js';
import { dayEarned, listCore } from '../miniprogram/utils/point.js';
import { rewardState } from '../miniprogram/utils/reward.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/parent/doc.md（`PARENT` 区第二段 `PARENT-24` ~ `53`、
// 第三段 `PARENT-72` ~ `77`）
// 按 AGENTS.md 第 13 条：parentTasks 的规格断言读取入口的输出，
// 四个写函数的规格断言存档里落了什么。
const NOW = new Date(2026, 7, 14, 20, 0, 0, 0).getTime();

/** 兑换审批那几条用的日期键（NOW 那天） */
const KEY = '2026-08-14';

/** 一份已填好默认任务表的存档（18 条，sortOrder 1..18） */
function seeded() {
  return seedHabits(defaultSave());
}

/** 取某一条任务定义 */
function row(save, id) {
  return save.habits.find((habit) => habit.id === id);
}

/** 某一类任务的 sortOrder，按数组次序 */
function ordersOf(save, category) {
  return save.habits.filter((habit) => habit.category === category).map((h) => h.sortOrder);
}

/** 停用某几条 */
function disable(save, ids) {
  return ids.reduce((acc, id) => saveHabit(acc, id, { enabled: false }), save);
}

/** 取消某几条的 core 标记 */
function uncore(save, ids) {
  return ids.reduce((acc, id) => saveHabit(acc, id, { core: false }), save);
}

describe('parentTasks 读取入口', () => {
  it('[PARENT-24] 默认存档列全部 18 条（含另两类），coreCount 为 7、不出提示', () => {
    const state = parentTasks(seeded());

    expect(state.habits).toHaveLength(18);
    expect(state.habits.map((habit) => habit.sortOrder)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    // 与 listHabits 正相反：那边只有 habit 类的九格，这边三类都在
    expect(state.habits.filter((habit) => habit.category === 'habit')).toHaveLength(9);
    expect(state.habits.filter((habit) => habit.category === 'learning')).toHaveLength(5);
    expect(state.habits.filter((habit) => habit.category === 'health')).toHaveLength(4);
    expect(state.coreCount).toBe(7);
    expect(state.coreWarn).toBe(null);
  });

  it('[PARENT-25] 每条带 editable 与 first / last，边界是同类内的边界', () => {
    const state = parentTasks(seeded());
    const at = (id) => state.habits.find((habit) => habit.id === id);

    // editable 由 utils 算：页面判 category 等于把同一个判断抄第二遍
    expect(state.habits.filter((habit) => habit.editable)).toHaveLength(9);
    expect(at('wake').editable).toBe(true);
    expect(at('literacy').editable).toBe(false);
    expect(at('bath').editable).toBe(false);

    // 上移 / 下移只在同类内移动，所以三类各有自己的头尾
    expect([at('wake').first, at('wake').last]).toEqual([true, false]);
    expect([at('sleep').first, at('sleep').last]).toEqual([false, true]);
    expect([at('literacy').first, at('english').last]).toEqual([true, true]);
    expect([at('exercise').first, at('bath').last]).toEqual([true, true]);
    // 中间那些两个都是 false
    expect([at('brush-pm').first, at('brush-pm').last]).toEqual([false, false]);
  });

  it('[PARENT-26] 停用的那条仍在列表里，只是不进 coreCount', () => {
    const state = parentTasks(disable(seeded(), ['poop']));
    const poop = state.habits.find((habit) => habit.id === 'poop');

    // 列了才能开回来 —— 这是本入口不复用 listHabits 的全部理由
    expect(poop).toBeDefined();
    expect(poop.enabled).toBe(false);
    expect(state.habits).toHaveLength(18);
    expect(state.coreCount).toBe(6);
    expect(state.coreWarn).toBe(null);
  });

  it('[PARENT-27] 七条核心项全停用时 coreWarn 为 none（提示不是门禁）', () => {
    const state = parentTasks(
      disable(
        seeded(),
        listCore(seeded()).map((habit) => habit.id),
      ),
    );

    expect(state.coreCount).toBe(0);
    expect(state.coreWarn).toBe('none');
    // 家长可以把核心项全关掉（孩子生病那周不要求排便打卡），
    // awardAllDone 的 core.length === 0 那一支已经写好了（POINT-26）
    expect(state.habits).toHaveLength(18);
  });

  it('[PARENT-28] 只剩 4 条核心项时 coreWarn 为 few，阈值是 WEEKLY_BONUS.minDays 的 5', () => {
    const state = parentTasks(uncore(seeded(), ['literacy', 'reading', 'exercise']));

    expect(state.coreCount).toBe(4);
    expect(state.coreWarn).toBe('few');
    // 恰好 5 条时不提示：< minDays 才算少
    expect(parentTasks(uncore(seeded(), ['literacy', 'reading'])).coreWarn).toBe(null);
  });

  it('[PARENT-53] 三条兑换卡全都列，停用的 enabled 为 false（不复用 rewardState().items）', () => {
    const save = toggleReward(seeded(), 'snack');
    const state = parentTasks(save);

    expect(state.rewards.map((reward) => reward.id)).toEqual(['snack', 'cartoon', 'money']);
    expect(state.rewards.map((reward) => reward.enabled)).toEqual([false, true, true]);
    // rewardState 那一份已经把停用的过滤掉了，家长端拿它就再也开不回来（REWARD-16）
    expect(rewardState(save, '2026-08-14', NOW).items.map((item) => item.id)).toEqual([
      'cartoon',
      'money',
    ]);
    // 卡的定义留在常量里，家长只能开关
    expect(state.rewards.map((reward) => reward.medalCost)).toEqual(
      REWARDS.map((reward) => reward.medalCost),
    );
  });

  it('脏存档不抛错：habits 缺失、元素有脏字段都只影响数值', () => {
    for (const raw of [{}, { habits: 42 }, { habits: [null, '坏元素'] }, undefined]) {
      const state = parentTasks(raw);
      expect(state.habits).toEqual([]);
      expect(state.coreWarn).toBe('none');
      expect(state.rewards).toHaveLength(3);
    }

    // 未登记的 category 排在三段之后且不丢 —— 本层不认得的不删
    const dirty = parentTasks({
      habits: [
        { id: 'x', category: 'weird', sortOrder: 1 },
        { id: 'wake', category: 'habit', sortOrder: 9 },
      ],
    });
    expect(dirty.habits.map((habit) => habit.id)).toEqual(['wake', 'x']);
    // 读取路径不改 sortOrder 的值：给页面的必须是存档里那个数字
    expect(dirty.habits.map((habit) => habit.sortOrder)).toEqual([9, 1]);
  });
});

describe('saveHabit', () => {
  it('[PARENT-29] 改名字与图标只动那一条，其余 17 条与其它字段不动', () => {
    const save = seeded();
    const next = saveHabit(save, 'wake', { name: '起床', icon: '⏰' });

    expect(row(next, 'wake').name).toBe('起床');
    expect(row(next, 'wake').icon).toBe('⏰');
    // 同一条上没被 patch 的字段原样保留
    expect(row(next, 'wake')).toMatchObject({
      id: 'wake',
      category: 'habit',
      frequency: 'daily',
      starReward: 1,
      petFoodReward: 1,
      enabled: true,
      sortOrder: 1,
      core: true,
    });
    expect(next.habits).toHaveLength(18);
    expect(next.habits.filter((habit) => habit.id !== 'wake')).toEqual(
      save.habits.filter((habit) => habit.id !== 'wake'),
    );
    // 不改传入的存档
    expect(row(save, 'wake').name).toBe('按时起床');
  });

  it('[PARENT-30] 停用一条：listHabits 少一格、listCore 也少一条（分母跟着变）', () => {
    const next = saveHabit(seeded(), 'wake', { enabled: false });

    expect(row(next, 'wake').enabled).toBe(false);
    expect(listHabits(next)).toHaveLength(8);
    expect(listCore(next)).toHaveLength(6);
    // core 标记还在 —— 开回来就又进分母了（这是软删除的全部意义）
    expect(row(next, 'wake').core).toBe(true);
  });

  it('[PARENT-31] 取消 core：listCore 少一条，但九格还在', () => {
    const next = saveHabit(seeded(), 'wake', { core: false });

    expect(row(next, 'wake').core).toBe(false);
    expect(listCore(next)).toHaveLength(6);
    // 与 PARENT-30 的区别：这一条不影响首页那九格。
    // 少了本条，一个只过滤 enabled 的 listCore 也能全绿
    expect(listHabits(next)).toHaveLength(9);
    expect(row(next, 'wake').enabled).toBe(true);
  });

  it('[PARENT-32] 两个产出值夹 0 ~ 10 并取整', () => {
    expect(row(saveHabit(seeded(), 'wake', { starReward: 99 }), 'wake').starReward).toBe(10);
    expect(row(saveHabit(seeded(), 'wake', { starReward: -3 }), 'wake').starReward).toBe(0);
    expect(row(saveHabit(seeded(), 'wake', { starReward: 2.6 }), 'wake').starReward).toBe(3);
    expect(row(saveHabit(seeded(), 'wake', { petFoodReward: 99 }), 'wake').petFoodReward).toBe(10);
    // 上界不是防溢出是防通胀：一条 99 星光的任务让其余 17 条失去意义
    expect(() => saveHabit(seeded(), 'wake', { starReward: '3' })).toThrow(RangeError);
    expect(() => saveHabit(seeded(), 'wake', { starReward: Number.NaN })).toThrow(RangeError);
  });

  it('[PARENT-33] 名字全空白回落「未命名」，不抛错也不落空串', () => {
    expect(row(saveHabit(seeded(), 'wake', { name: '   ' }), 'wake').name).toBe('未命名');
    expect(row(saveHabit(seeded(), 'wake', { name: '' }), 'wake').name).toBe('未命名');
    // 非字符串也回落（输入框里什么都可能）
    expect(row(saveHabit(seeded(), 'wake', { name: 42 }), 'wake').name).toBe('未命名');
    // 图标同理
    expect(row(saveHabit(seeded(), 'wake', { icon: '  ' }), 'wake').icon).toBe('⭐');
    // 两端空白被 trim
    expect(row(saveHabit(seeded(), 'wake', { name: ' 起床 ' }), 'wake').name).toBe('起床');
  });

  it('[PARENT-34] 六个不可改字段与拼错的键都抛 RangeError', () => {
    const save = seeded();

    for (const patch of [
      { id: 'x' },
      { category: 'health' },
      { frequency: 'weekly' },
      { module: 'guoxue' },
      { weeklyTarget: 3 },
      { needsParentConfirm: true },
      { starRewrad: 3 },
      { enabled: false, id: 'x' },
    ]) {
      expect(() => saveHabit(save, 'wake', patch)).toThrow(RangeError);
    }

    // patch 本身不是对象也抛
    for (const bad of [undefined, null, 42, 'name', ['name']]) {
      expect(() => saveHabit(save, 'wake', bad)).toThrow(RangeError);
    }
  });

  it('[PARENT-35] sortOrder 单独抛 RangeError：顺序只能走 moveHabit', () => {
    const save = seeded();

    expect(() => saveHabit(save, 'wake', { sortOrder: 5 })).toThrow(RangeError);
    // 它是登记过的字段，所以错误里说的是「只能经 moveHabit 改」而不是「不是可改字段」——
    // 两个入口会让「每次重排成 1..N」这个前提失效
    expect(() => saveHabit(save, 'wake', { sortOrder: 5 })).toThrow(/moveHabit/);
  });

  it('[PARENT-36] learning / health 两类的 name / icon 抛 RangeError', () => {
    const save = seeded();

    expect(() => saveHabit(save, 'literacy', { name: 'x' })).toThrow(RangeError);
    expect(() => saveHabit(save, 'literacy', { icon: '📕' })).toThrow(RangeError);
    expect(() => saveHabit(save, 'bath', { name: 'x' })).toThrow(RangeError);
    // 与 parentTasks 的 editable 说同一件事：那两类的显示名在别处（
    // data/learningModules.js 与健康页模板），改了两处会不一致
    expect(parentTasks(save).habits.find((habit) => habit.id === 'literacy').editable).toBe(false);
  });

  it('[PARENT-37] learning 类的 enabled / core / 两个产出改得动', () => {
    const next = saveHabit(seeded(), 'literacy', { enabled: false });
    expect(row(next, 'literacy').enabled).toBe(false);

    const scored = saveHabit(seeded(), 'literacy', { core: false, starReward: 3 });
    expect(row(scored, 'literacy')).toMatchObject({ core: false, starReward: 3 });
    // 那四个字段与 category 无关 —— 它们是本仓库真的会读的字段
    expect(row(saveHabit(seeded(), 'bath', { petFoodReward: 4 }), 'bath').petFoodReward).toBe(4);
  });

  it('[PARENT-38] 未登记的 habitId 抛 RangeError', () => {
    expect(() => saveHabit(seeded(), '不存在的id', { name: 'x' })).toThrow(RangeError);
    // 页面上的 id 全部来自 parentTasks，传别的值只可能是编程错误
    expect(() => saveHabit(defaultSave(), 'wake', { name: 'x' })).toThrow(RangeError);
  });

  it('[PARENT-39] 空 patch 或值与现值全同时原样返回入参（对象同一性）', () => {
    const save = seeded();

    expect(saveHabit(save, 'wake', {})).toBe(save);
    expect(saveHabit(save, 'wake', { name: '按时起床' })).toBe(save);
    expect(saveHabit(save, 'wake', { enabled: true, core: true, starReward: 1 })).toBe(save);
    // 取整之后与现值相同也算没变（1.4 → 1）
    expect(saveHabit(save, 'wake', { starReward: 1.4 })).toBe(save);
    // 页面 if (next === this.save) return 于是不落盘
    expect(saveHabit(save, 'wake', { name: '起床' })).not.toBe(save);
  });
});

describe('addHabit', () => {
  it('[PARENT-40] 新增一条 habit 类任务，产出与开关落默认值', () => {
    const next = addHabit(seeded(), { name: '收拾书包', icon: '🎒' }, NOW);

    expect(next.habits).toHaveLength(19);
    expect(row(next, `t${NOW}`)).toEqual({
      id: `t${NOW}`,
      name: '收拾书包',
      icon: '🎒',
      category: 'habit',
      frequency: 'daily',
      starReward: 1,
      petFoodReward: 1,
      needsParentConfirm: false,
      enabled: true,
      sortOrder: 10,
      // core 落 false：家长新加的任务不该让「今天全勤」的门槛悄悄变高
      core: false,
    });
    expect(listCore(next)).toHaveLength(7);
    // 新任务立刻出现在首页九格之后的第十格
    expect(listHabits(next).map((habit) => habit.id)).toContain(`t${NOW}`);
    // 图标缺省时回落
    expect(row(addHabit(seeded(), { name: 'x' }, NOW), `t${NOW}`).icon).toBe('⭐');
  });

  it('[PARENT-41] 新任务排在 habit 段末尾，另两段整体后移一位 —— 段与段不交叠', () => {
    const next = addHabit(seeded(), { name: '收拾书包', icon: '🎒' }, NOW);

    expect(ordersOf(next, 'habit')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ordersOf(next, 'learning')).toEqual([11, 12, 13, 14, 15]);
    expect(ordersOf(next, 'health')).toEqual([16, 17, 18, 19]);
    expect(row(next, `t${NOW}`).sortOrder).toBe(10);
    // habit 段原有九条的相对顺序没变
    expect(next.habits.slice(0, 9).map((habit) => habit.id)).toEqual(
      seeded()
        .habits.slice(0, 9)
        .map((habit) => habit.id),
    );
  });

  it('[PARENT-42] 同一个 now 连着新增两次，第二条的 id 追加 -2', () => {
    const once = addHabit(seeded(), { name: '第一条' }, NOW);
    const twice = addHabit(once, { name: '第二条' }, NOW);
    const thrice = addHabit(twice, { name: '第三条' }, NOW);

    expect(twice.habits).toHaveLength(20);
    expect(row(twice, `t${NOW}-2`).name).toBe('第二条');
    expect(row(thrice, `t${NOW}-3`).name).toBe('第三条');
    // id 由传进来的 now 拼：utils 不读 Date.now()，同样的入参给同样的 id
    expect(addHabit(seeded(), { name: '第一条' }, NOW).habits.at(9).id).toBe(`t${NOW}`);
  });

  it('[PARENT-43] 名字全空白抛 RangeError（与 saveHabit 的回落故意不一致）', () => {
    const save = seeded();

    for (const name of ['   ', '', undefined, 42]) {
      expect(() => addHabit(save, { name }, NOW)).toThrow(RangeError);
    }
    // 同一个字段两种策略：新增是提交路径，名字是必填项；
    // saveHabit 那一侧是「家长清空了输入框又保存」，属于宽容的一侧
    expect(row(saveHabit(save, 'wake', { name: '   ' }), 'wake').name).toBe('未命名');
  });

  it('[PARENT-44] 非 habit 类抛 RangeError（加完没有页面能打上这一卡）', () => {
    const save = seeded();

    expect(() => addHabit(save, { name: 'x', category: 'learning' }, NOW)).toThrow(RangeError);
    expect(() => addHabit(save, { name: 'x', category: 'health' }, NOW)).toThrow(RangeError);
    expect(() => addHabit(save, { name: 'x', category: 'weird' }, NOW)).toThrow(RangeError);
    // 显式传 habit 与不传等价
    expect(row(addHabit(save, { name: 'x', category: 'habit' }, NOW), `t${NOW}`).category).toBe(
      'habit',
    );
    // 未登记的表单字段也抛（家长端不是万能写入口，与 saveSettings 同形）
    expect(() => addHabit(save, { name: 'x', core: true }, NOW)).toThrow(RangeError);
    expect(() => addHabit(save, { name: 'x', sortOrder: 1 }, NOW)).toThrow(RangeError);
    for (const bad of [undefined, null, 42, 'x']) {
      expect(() => addHabit(save, bad, NOW)).toThrow(RangeError);
    }
  });

  it('[PARENT-45] now 非有限数抛 TypeError', () => {
    const save = seeded();

    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, '现在', null]) {
      expect(() => addHabit(save, { name: 'x' }, bad)).toThrow(TypeError);
    }
  });
});

describe('moveHabit', () => {
  it('[PARENT-46] 第二条上移与第一条换位，habit 段的 sortOrder 仍连续', () => {
    const next = moveHabit(seeded(), 'brush-am', -1);

    expect(next.habits.slice(0, 2).map((habit) => habit.id)).toEqual(['brush-am', 'wake']);
    expect(row(next, 'brush-am').sortOrder).toBe(1);
    expect(row(next, 'wake').sortOrder).toBe(2);
    expect(ordersOf(next, 'habit')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // 下移是同一条路的反向：换回去等于没动过
    expect(moveHabit(next, 'brush-am', 1).habits).toEqual(seeded().habits);
  });

  it('[PARENT-47] 第一条上移原样返回入参（对象同一性），parentTasks 里它的 first 为 true', () => {
    const save = seeded();

    expect(moveHabit(save, 'wake', -1)).toBe(save);
    expect(moveHabit(save, 'sleep', 1)).toBe(save);
    // 三类各有自己的边界：learning 段的第一条上移也不动
    expect(moveHabit(save, 'literacy', -1)).toBe(save);
    expect(moveHabit(save, 'bath', 1)).toBe(save);
    // 与 first / last 说同一件事：那两个给按钮置灰，这一条给「点了也没事」
    const at = (id) => parentTasks(save).habits.find((habit) => habit.id === id);
    expect(at('wake').first).toBe(true);
    expect(at('literacy').first).toBe(true);
    expect(at('bath').last).toBe(true);
  });

  it('[PARENT-48] sortOrder 有重复值的脏存档：一次调用就把撞的解开', () => {
    // 线上 addTask 用 tasks.length + 1 当序号、删过任务之后必然与既有的撞（缺陷 8）
    const dirty = {
      ...defaultSave(),
      habits: [
        { id: 'wake', category: 'habit', sortOrder: 1, enabled: true, core: true },
        { id: 'brush-am', category: 'habit', sortOrder: 1, enabled: true, core: true },
        { id: 'dress', category: 'habit', sortOrder: 1, enabled: true, core: false },
        { id: 'literacy', category: 'learning', sortOrder: 2, enabled: true, core: true },
        { id: 'reading', category: 'learning', sortOrder: 2, enabled: true, core: true },
      ],
    };
    const next = moveHabit(dirty, 'brush-am', 1);
    const orders = next.habits.map((habit) => habit.sortOrder);

    // 全局连续无重复 —— 重排让「值是否连续」不再是前提
    expect(orders).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(orders).size).toBe(orders.length);
    // sort 的稳定性保证结果确定：重复值之间保持原数组次序，下移仍是与后一条换位
    expect(next.habits.map((habit) => habit.id)).toEqual([
      'wake',
      'dress',
      'brush-am',
      'literacy',
      'reading',
    ]);
  });

  it('[PARENT-49] learning 段内下移：另外两段的 sortOrder 一个没变', () => {
    const save = seeded();
    const next = moveHabit(save, 'literacy', 1);

    expect(row(next, 'literacy').sortOrder).toBe(11);
    expect(row(next, 'reading').sortOrder).toBe(10);
    expect(next.habits.slice(9, 11).map((habit) => habit.id)).toEqual(['reading', 'literacy']);
    // 落盘前整段重排成 1..N，而默认表本来就是 1..9 / 10..14 / 15..18，
    // 所以「在 learning 段内下移」改不到另外两段
    expect(ordersOf(next, 'habit')).toEqual(ordersOf(save, 'habit'));
    expect(ordersOf(next, 'health')).toEqual(ordersOf(save, 'health'));
    expect(next.habits.filter((habit) => habit.category !== 'learning')).toEqual(
      save.habits.filter((habit) => habit.category !== 'learning'),
    );
  });

  it('[PARENT-50] delta 只认 -1 / 1，其余抛 RangeError；未知 id 也抛', () => {
    const save = seeded();

    for (const delta of [2, 0, -2, 1.5, '1', undefined, null, Number.NaN]) {
      expect(() => moveHabit(save, 'wake', delta)).toThrow(RangeError);
    }
    // 页面只有上移 / 下移两个按钮
    expect(() => moveHabit(save, '不存在的id', 1)).toThrow(RangeError);
  });
});

describe('toggleReward', () => {
  it('[PARENT-51] 停用再启用一个来回，data/rewards.js 不动', () => {
    const save = seeded();
    const off = toggleReward(save, 'snack');
    const on = toggleReward(off, 'snack');

    // 缺键当启用，所以第一次停用写 false、再点一次写 true（不删键）
    expect(off.rewardFlags).toEqual({ snack: false });
    expect(on.rewardFlags).toEqual({ snack: true });
    expect(parentTasks(off).rewards[0].enabled).toBe(false);
    expect(parentTasks(on).rewards[0].enabled).toBe(true);

    // 另外两条不受影响，卡的定义留在常量里（改价不做）
    expect(off.rewardFlags.cartoon).toBeUndefined();
    expect(REWARDS.map((reward) => reward.medalCost)).toEqual([2, 3, 5]);
    expect(save.rewardFlags).toEqual({});

    // 脏存档（rewardFlags 非对象）也能开关
    expect(toggleReward({ ...save, rewardFlags: 42 }, 'snack').rewardFlags).toEqual({
      snack: false,
    });
  });

  it('[PARENT-52] 未登记的 rewardId 抛 RangeError', () => {
    const save = seeded();

    for (const id of ['toy', '', undefined, 42, null]) {
      expect(() => toggleReward(save, id)).toThrow(RangeError);
    }
  });
});

/** 一条兑换记录 */
function redemption(at, status, medalCost = 3) {
  return { at, rewardId: 'snack', name: '小零食', icon: '🍬', medalCost, status };
}

/** 三条记录 + 20 枚勋章的存档 */
function withRedemptions(list) {
  return { ...seeded(), currency: { star: 0, gem: 0, petFood: 0, medal: 20 }, redemptions: list };
}

describe('resolveRedemption', () => {
  it('[PARENT-72] 兑现：status 落 done，货币一分不动、当天流水不加行', () => {
    const save = withRedemptions([redemption(NOW - 1000, 'pending')]);
    const next = resolveRedemption(save, KEY, NOW - 1000, 'done', NOW);

    expect(next.redemptions[0].status).toBe('done');
    // 申请那一刻 redeem 已经 postLedger('spend') 扣过了，这里只回答「东西给了没有」
    expect(next.currency).toEqual(save.currency);
    expect(next.days?.[KEY]?.ledger ?? []).toEqual([]);
    expect(dayEarned(next, KEY)).toEqual({ star: 0, gem: 0, petFood: 0, medal: 0 });
    // 入参不动
    expect(save.redemptions[0].status).toBe('pending');
  });

  it('[PARENT-73] 驳回：status 落 cancelled，退回 3 枚且当天流水多一条 earn', () => {
    const save = withRedemptions([redemption(NOW - 1000, 'pending', 3)]);
    const next = resolveRedemption(save, KEY, NOW - 1000, 'cancelled', NOW);

    expect(next.redemptions[0].status).toBe('cancelled');
    expect(next.currency.medal).toBe(23);

    // 退款走 postLedger，不直接改 currency —— 否则账与余额悄悄分叉
    // （point.js 头注释：save.currency 只可能被 point.js 改，而它每次改都追加一条流水）
    const ledger = next.days[KEY].ledger;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual({
      at: NOW,
      type: 'earn',
      reason: '退回：小零食',
      star: 0,
      gem: 0,
      petFood: 0,
      medal: 3,
    });
    // 退款落在**驳回那一天**的流水里，不是申请那一天
    expect(dayEarned(next, KEY).medal).toBe(3);
  });

  it('[PARENT-74] 已经不是 pending 时原样返回入参（对象同一性）', () => {
    for (const status of ['done', 'cancelled']) {
      const save = withRedemptions([redemption(NOW - 1000, status)]);
      // 家长在两处各点一下是竞态，不是编程错误（与 redeem 遇到停用卡同一条）
      expect(resolveRedemption(save, KEY, NOW - 1000, 'done', NOW)).toBe(save);
      expect(resolveRedemption(save, KEY, NOW - 1000, 'cancelled', NOW)).toBe(save);
    }
  });

  it('[PARENT-75] at 找不到抛 RangeError', () => {
    const save = withRedemptions([redemption(NOW - 1000, 'pending')]);

    // 按钮的 at 全部来自 parentTasks 的输出，传别的值只可能是代码写错
    for (const at of [NOW, 0, undefined, null, '2026-08-14']) {
      expect(() => resolveRedemption(save, KEY, at, 'done', NOW)).toThrow(RangeError);
    }
    expect(() => resolveRedemption(seeded(), KEY, NOW - 1000, 'done', NOW)).toThrow(RangeError);
  });

  it('[PARENT-76] action 非法抛 RangeError；now 非有限数抛 TypeError', () => {
    const save = withRedemptions([redemption(NOW - 1000, 'pending')]);

    // 页面只有两个按钮
    for (const action of ['pending', 'rejected', '', undefined, null, 1]) {
      expect(() => resolveRedemption(save, KEY, NOW - 1000, action, NOW)).toThrow(RangeError);
    }
    // 退款要用它落流水
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, '2026', undefined, null]) {
      expect(() => resolveRedemption(save, KEY, NOW - 1000, 'cancelled', now)).toThrow(TypeError);
    }
  });

  it('[PARENT-77] pending 只列待兑现的那条；全部处理完是 [] 不是 null', () => {
    const save = withRedemptions([
      redemption(NOW - 3000, 'pending'),
      redemption(NOW - 2000, 'done'),
      redemption(NOW - 1000, 'cancelled'),
    ]);

    const state = parentTasks(save);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].at).toBe(NOW - 3000);

    // 线上 bB() 空时 return null，整块卡片消失 —— 而它是全应用里唯一能看到那条申请的地方
    const resolved = resolveRedemption(save, KEY, NOW - 3000, 'done', NOW);
    expect(parentTasks(resolved).pending).toEqual([]);
    expect(parentTasks(seeded()).pending).toEqual([]);
    // 脏存档（redemptions 非数组）也不炸
    expect(parentTasks({ ...seeded(), redemptions: 42 }).pending).toEqual([]);
  });
});
