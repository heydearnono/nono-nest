import { describe, expect, it } from 'vitest';

import { CHARACTERS, CHAR_EMOJI } from '../miniprogram/data/characters.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import { gradeChar, literacyState } from '../miniprogram/utils/literacy.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/literacy/doc.md（`LITERACY` 区）
// 2026-08-12 是周三；语料前五条是 的 一 是 在 不（字频降序）。

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 往存档里塞一张识字进度表（不走 gradeChar，直接构造） */
function withChars(chars, save = seeded()) {
  return { ...save, learningProgress: { literacy: { chars } } };
}

/** 只取卡片上的字，断言队列时用 */
function chars(cards) {
  return cards.map((card) => card.char);
}

/** 一条「学过但没到期」的进度记录：不进新字池，也不进复习队列 */
function mid(due = '2026-08-20') {
  return { step: 1, due, wrong: 0 };
}

describe('两个队列的取法（LITERACY）', () => {
  it('[LITERACY-01] 空存档给语料最前的两个新字，复习队列是空的', () => {
    const state = literacyState(seeded(), DAY, NOW);

    expect(chars(state.newChars)).toEqual(['的', '一']);
    expect(state.reviewChars).toEqual([]);
    expect(state.total).toBe(2000);
    expect(state.todayNew).toBe(0);
    expect(state.dailyNew).toBe(2);
    expect(state.learned).toBe(0);
    expect(state.mastered).toBe(0);
  });

  it('[LITERACY-02] 卡片带 emoji，取值是 CHAR_EMOJI[下标 % 15]', () => {
    const { newChars } = literacyState(seeded(), DAY, NOW);

    // 「的」在语料第 0 条，「一」在第 1 条 —— emoji 不是数据，是下标算出来的
    expect(newChars[0]).toMatchObject({ char: '的', pinyin: 'de', emoji: CHAR_EMOJI[0] });
    expect(newChars[0].emoji).toBe('🌸');
    expect(newChars[1].emoji).toBe(CHAR_EMOJI[1]);

    // 语料任意一条都成立，抽第 17 条验一次「% 15 绕回来」
    const at17 = CHARACTERS[17].char;
    const state = literacyState(
      withChars(Object.fromEntries(CHARACTERS.slice(0, 17).map((c) => [c.char, mid()]))),
      DAY,
      NOW,
    );
    expect(state.newChars[0]).toMatchObject({ char: at17, emoji: CHAR_EMOJI[17 % 15] });
  });

  it('[LITERACY-03] 学过的字被跳过，新字仍按语料顺序取最前两个', () => {
    const state = literacyState(withChars({ 的: mid() }), DAY, NOW);

    expect(chars(state.newChars)).toEqual(['一', '是']);
    expect(state.learned).toBe(1);
  });
});

describe('复习间隔与掌握判定（LITERACY）', () => {
  it('[LITERACY-04] 第一次答对：step 为 1、due 是明天', () => {
    const next = gradeChar(seeded(), DAY, '的', true, NOW);

    expect(next.learningProgress.literacy.chars.的).toEqual({
      step: 1,
      due: '2026-08-13',
      wrong: 0,
    });
    expect(literacyState(next, DAY, NOW).learned).toBe(1);
  });

  it('[LITERACY-05] 连续答对，due 依次是 +1 / +2 / +4 / +7 / +14 / +30 天', () => {
    // 本轮偏离线上最要紧的一条：线上六个日期一次性写入、some(d <= 今天) 判定，
    // 实际间隔恒为 1 天。没有这条断言，「按线上抄回去」不会有任何东西报警。
    // 每一次都在上次的到期日答对，所以下面这串日期就是那六个间隔的累加。
    const dues = [
      '2026-08-13', // 08-12 + 1
      '2026-08-15', // 08-13 + 2
      '2026-08-19', // 08-15 + 4
      '2026-08-26', // 08-19 + 7
      '2026-09-09', // 08-26 + 14
      '2026-10-09', // 09-09 + 30
    ];

    let save = seeded();
    let key = DAY;

    for (const [i, due] of dues.entries()) {
      const now = new Date(`${key}T19:00:00`).getTime();
      save = gradeChar(save, key, '的', true, now);
      const record = save.learningProgress.literacy.chars.的;

      expect(record.step).toBe(i + 1);
      expect(record.due).toBe(due);

      key = due; // 下一次评分发生在到期那天（同一天不能评两次，LITERACY-13）
    }

    // 六个间隔都熬过来了，此时 step 是 6、还没掌握
    expect(save.learningProgress.literacy.chars.的.step).toBe(6);
    expect(literacyState(save, key, new Date(`${key}T19:00:00`).getTime()).mastered).toBe(0);
  });

  it('[LITERACY-06] 第七次答对（六个间隔全熬过）就是已掌握', () => {
    const save = withChars({ 的: { step: 6, due: DAY, wrong: 0 } });
    const next = gradeChar(save, DAY, '的', true, NOW);

    expect(next.learningProgress.literacy.chars.的).toEqual({ step: 7, due: '', wrong: 0 });
    expect(literacyState(next, DAY, NOW).mastered).toBe(1);
  });

  it('[LITERACY-07] 已掌握的字既不进新字池也不进复习队列', () => {
    const state = literacyState(withChars({ 的: { step: 7, due: '', wrong: 0 } }), DAY, NOW);

    expect(chars(state.newChars)).not.toContain('的');
    expect(chars(state.reviewChars)).toEqual([]);
    expect(state.mastered).toBe(1);
    expect(state.learned).toBe(1);
  });

  it('[LITERACY-08] 答错：step 回 0、due 是今天、wrong 加 1', () => {
    const save = withChars({ 的: { step: 3, due: DAY, wrong: 1 } });
    const next = gradeChar(save, DAY, '的', false, NOW);

    expect(next.learningProgress.literacy.chars.的).toEqual({ step: 0, due: DAY, wrong: 2 });
  });
});

describe('到期判定与排序（LITERACY）', () => {
  it('[LITERACY-09] 昨天答对（due 是今天）的字今天回到复习队列', () => {
    const state = literacyState(withChars({ 的: { step: 1, due: DAY, wrong: 0 } }), DAY, NOW);

    expect(chars(state.reviewChars)).toEqual(['的']);
    // 过期更久的一样到期（due <= 今天，日期键字符串比较）
    const stale = literacyState(
      withChars({ 一: { step: 2, due: '2026-07-01', wrong: 0 } }),
      DAY,
      NOW,
    );
    expect(chars(stale.reviewChars)).toEqual(['一']);
  });

  it('[LITERACY-10] due 在明天的字不进复习队列', () => {
    const state = literacyState(
      withChars({ 的: { step: 1, due: '2026-08-13', wrong: 0 } }),
      DAY,
      NOW,
    );

    expect(state.reviewChars).toEqual([]);
    expect(state.learned).toBe(1);
  });

  it('[LITERACY-11] 同一天到期时错得多的排最前，其余按语料顺序', () => {
    const state = literacyState(
      withChars({
        是: { step: 1, due: DAY, wrong: 0 }, // 语料第 2 条
        的: { step: 1, due: DAY, wrong: 0 }, // 语料第 0 条
        一: { step: 1, due: DAY, wrong: 2 }, // 语料第 1 条，但错了两次
      }),
      DAY,
      NOW,
    );

    expect(chars(state.reviewChars)).toEqual(['一', '的', '是']);
  });

  it('[LITERACY-12] 到期的字超过 8 个时只给 8 条', () => {
    const due = Object.fromEntries(
      CHARACTERS.slice(0, 12).map((c) => [c.char, { step: 1, due: DAY, wrong: 0 }]),
    );
    const state = literacyState(withChars(due), DAY, NOW);

    expect(state.reviewChars).toHaveLength(8);
    expect(chars(state.reviewChars)).toEqual(CHARACTERS.slice(0, 8).map((c) => c.char));
    expect(state.learned).toBe(12);
  });
});

describe('当天去重（LITERACY）', () => {
  it('[LITERACY-13] 同一个字当天第二次评分原样返回入参', () => {
    const once = gradeChar(seeded(), DAY, '的', true, NOW);
    const twice = gradeChar(once, DAY, '的', false, NOW + 1000);

    // 对象同一性，不是深相等 —— 页面靠 next === this.save 决定要不要落盘
    expect(twice).toBe(once);
    expect(twice.learningProgress.literacy.chars.的).toEqual({
      step: 1,
      due: '2026-08-13',
      wrong: 0,
    });
    expect(twice.days[DAY].learning.literacy.newChars).toEqual(['的']);
  });

  it('[LITERACY-14] 当天答错的字当天不再回到复习队列，明天才回来', () => {
    const save = withChars({ 的: { step: 2, due: DAY, wrong: 0 } });
    const next = gradeChar(save, DAY, '的', false, NOW);

    // due 是今天，但当天已评过 —— 不拦的话它会在同一次会话里一直回到队列顶上
    expect(chars(literacyState(next, DAY, NOW).reviewChars)).not.toContain('的');
    expect(next.days[DAY].learning.literacy.reviewed).toEqual(['的']);

    const tomorrow = new Date(2026, 7, 13, 9, 0, 0, 0).getTime();
    expect(chars(literacyState(next, '2026-08-13', tomorrow).reviewChars)).toEqual(['的']);
  });
});

describe('识字打卡与发放（LITERACY）', () => {
  it('[LITERACY-15] 当天新学第二个字才打卡：2 星 2 粮、流水一条', () => {
    const one = gradeChar(seeded(), DAY, '的', true, NOW);

    // 第一个字不打卡（每天 2 个新字才算这一格）
    expect(one.days[DAY]?.checks?.literacy).toBeUndefined();
    expect(one.currency.star).toBe(0);

    const two = gradeChar(one, DAY, '一', true, NOW + 1000);

    expect(two.days[DAY].checks.literacy).toMatchObject({ at: NOW + 1000 });
    expect(two.currency.star).toBe(2);
    expect(two.currency.petFood).toBe(2);
    expect(ledgerOf(two, DAY)).toHaveLength(1);
    expect(ledgerOf(two, DAY)[0]).toMatchObject({
      type: 'earn',
      star: 2,
      petFood: 2,
      reason: '完成：识字',
    });
    expect(literacyState(two, DAY, NOW).done).toBe(true);
  });

  it('[LITERACY-16] 识字打卡经验 +8（与 LEARN-08 同价，不是自律的 5），开心度 +1', () => {
    const base = seeded();
    const save = { ...base, pet: { ...base.pet, petExp: 0, mood: 2 } };
    const next = gradeChar(gradeChar(save, DAY, '的', true, NOW), DAY, '一', true, NOW + 1000);

    expect(next.pet.petExp).toBe(8);
    expect(next.pet.mood).toBe(3);
  });

  it('[LITERACY-17] 当天新学第三个字不重复发放', () => {
    let save = gradeChar(seeded(), DAY, '的', true, NOW);
    save = gradeChar(save, DAY, '一', true, NOW + 1000);
    const third = gradeChar(save, DAY, '是', true, NOW + 2000);

    expect(third.currency.star).toBe(2);
    expect(third.pet.petExp).toBe(8);
    expect(ledgerOf(third, DAY)).toHaveLength(1);
    expect(third.days[DAY].learning.literacy.newChars).toEqual(['的', '一', '是']);
  });

  it('[LITERACY-18] 当天只复习、没学新字：不打卡、不发放', () => {
    const save = withChars({
      的: { step: 1, due: DAY, wrong: 0 },
      一: { step: 1, due: DAY, wrong: 0 },
    });
    const next = gradeChar(gradeChar(save, DAY, '的', true, NOW), DAY, '一', true, NOW + 1000);

    expect(next.days[DAY]?.checks?.literacy).toBeUndefined();
    expect(next.currency.star).toBe(0);
    expect(ledgerOf(next, DAY)).toEqual([]);
    expect(next.days[DAY].learning.literacy).toEqual({ newChars: [], reviewed: ['的', '一'] });
  });

  it('[LITERACY-19] 打卡后 checks / ledger / learning 三个兄弟键互不覆盖', () => {
    const next = gradeChar(gradeChar(seeded(), DAY, '的', true, NOW), DAY, '一', true, NOW + 1000);
    const day = next.days[DAY];

    expect(Object.keys(day).sort()).toEqual(['checks', 'learning', 'ledger']);
    expect(day.checks.literacy).toBeDefined();
    expect(day.ledger).toHaveLength(1);
    expect(day.learning.literacy.newChars).toEqual(['的', '一']);
  });

  it('[LITERACY-20] 当天记录两个列表都记「今天评过」，答错的字也在', () => {
    const save = withChars({ 天: { step: 2, due: DAY, wrong: 0 } });
    let next = gradeChar(save, DAY, '的', false, NOW); // 新字答错
    next = gradeChar(next, DAY, '天', false, NOW + 1000); // 复习答错

    expect(next.days[DAY].learning.literacy).toEqual({
      newChars: ['的'],
      reviewed: ['天'],
    });
  });
});

describe('错误策略与不变式（LITERACY）', () => {
  it('[LITERACY-21] gradeChar 传不在字库里的字抛 RangeError', () => {
    expect(() => gradeChar(seeded(), DAY, '𰻝', true, NOW)).toThrow(RangeError);
    expect(() => gradeChar(seeded(), DAY, '', true, NOW)).toThrow(RangeError);
  });

  it('[LITERACY-22] gradeChar 的 now 非有限数抛 TypeError', () => {
    expect(() => gradeChar(seeded(), DAY, '的', true, Number.NaN)).toThrow(TypeError);
    expect(() => gradeChar(seeded(), DAY, '的', true, undefined)).toThrow(TypeError);
  });

  it('[LITERACY-23] 没有识字任务时 literacyState 不抛、gradeChar 抛', () => {
    const base = seeded();
    const save = { ...base, habits: base.habits.filter((h) => h.module !== 'literacy') };

    // 渲染路径宽容：家长删了这条任务，识字页仍要能打开
    const state = literacyState(save, DAY, NOW);
    expect(state.done).toBe(false);
    expect(chars(state.newChars)).toEqual(['的', '一']);

    // 提交路径严格
    expect(() => gradeChar(save, DAY, '的', true, NOW)).toThrow(RangeError);
  });

  it('[LITERACY-24] 存档里的坏 step / wrong 在读取入口的输出上已被收敛', () => {
    const state = literacyState(
      withChars({
        的: { step: 99, due: DAY, wrong: -3 },
        一: { step: -1, due: DAY, wrong: 2.6 },
        是: { step: '2', due: DAY, wrong: undefined },
      }),
      DAY,
      NOW,
    );

    // step 99 被夹到 7 = 已掌握，所以它不在复习队列里，只算进 mastered
    expect(state.mastered).toBe(1);
    expect(state.learned).toBe(3);
    expect(chars(state.reviewChars)).toEqual(['一', '是']);
    expect(state.reviewChars.map((card) => card.step)).toEqual([0, 0]);
    expect(state.reviewChars.map((card) => card.wrong)).toEqual([3, 0]);
  });

  it('[LITERACY-25] gradeChar 不改传入的 save', () => {
    const save = withChars({ 天: { step: 1, due: DAY, wrong: 0 } });
    const snapshot = JSON.parse(JSON.stringify(save));

    gradeChar(save, DAY, '的', true, NOW);
    gradeChar(save, DAY, '天', false, NOW);

    expect(JSON.parse(JSON.stringify(save))).toEqual(snapshot);
  });

  it('[LITERACY-26] 语料全部学过时，复习完当天到期的字即打卡', () => {
    // 2000 字全学过（构造 chars，不逐个 gradeChar）：只有一个字今天到期
    const all = Object.fromEntries(
      CHARACTERS.map((c, i) => [c.char, i === 0 ? { step: 1, due: DAY, wrong: 0 } : mid()]),
    );
    const next = gradeChar(withChars(all), DAY, '的', true, NOW);

    // 新字池空，`newChars` 永远到不了 2 —— 不改判这一格 2000 天后就再也打不了卡
    expect(next.days[DAY].learning.literacy).toEqual({ newChars: [], reviewed: ['的'] });
    expect(next.days[DAY].checks.literacy).toMatchObject({ at: NOW });
    // 断言那条打卡流水，不断言流水总条数：P3-b 起 checkAwardAndGrow 末尾会结算奖励，
    // 而这份「2000 字全学过」的存档顺带满足 char-50，于是同一次调用里多一条解锁流水
    expect(ledgerOf(next, DAY).filter((e) => e.reason === '完成：识字')).toHaveLength(1);
    expect(next.pet.petExp).toBe(8);
  });
});
