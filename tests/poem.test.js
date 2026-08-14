import { describe, expect, it } from 'vitest';

import { POEMS } from '../miniprogram/data/poems.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import { poemState, studyPoem } from '../miniprogram/utils/poem.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/poem/doc.md（`POEM` 区）
// 2026-08-12 是周三，本周周一是 2026-08-10；下一周周一是 2026-08-17。
// 数据包前三首是 p1 咏鹅 / p2 静夜思 / p3 春晓；必背是 p1~p74 与 p105~p139（109 首），
// 拓展是 p75~p104 与 p140~p169（60 首）—— 所以必背全部会背后的第一首拓展诗是 p75。

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();
const NEXT_DAY = '2026-08-13';
const NEXT_NOW = new Date(2026, 7, 13, 9, 0, 0, 0).getTime();
const NEXT_WEEK_DAY = '2026-08-17';
const NEXT_WEEK_NOW = new Date(2026, 7, 17, 9, 0, 0, 0).getTime();
const THIS_WEEK = '2026-08-10';

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 往存档里塞一张古诗进度表（不走 studyPoem，直接构造） */
function withPoems(poems, weekly = undefined, save = seeded()) {
  return { ...save, learningProgress: { guoxue: { poems, weekly } } };
}

/** 只取卡片上的 id，断言列表时用 */
function ids(cards) {
  return cards.map((card) => card.id);
}

/** 一条「学过但没到期」的记录：不进选诗池，也不进复习列表 */
function mid(due = '2026-08-30') {
  return { step: 1, due, wrong: 0 };
}

/** 一条「今天到期」的记录 */
function due(wrong = 0, day = DAY) {
  return { step: 1, due: day, wrong };
}

describe('本周三首的选法（POEM）', () => {
  it('[POEM-01] 空存档给数据包最前的三首，复习列表是空的', () => {
    const state = poemState(seeded(), DAY, NOW);

    expect(ids(state.weekly)).toEqual(['p1', 'p2', 'p3']);
    expect(state.weekly.map((card) => card.title)).toEqual(['咏鹅', '静夜思', '春晓']);
    expect(state.reviews).toEqual([]);
    expect(state.done).toBe(false);
  });

  it('[POEM-02] 两个分母是 109 与 60，拓展默认没解锁', () => {
    const state = poemState(seeded(), DAY, NOW);

    expect(state.required).toEqual({ learned: 0, mastered: 0, total: 109 });
    expect(state.extended).toEqual({ learned: 0, mastered: 0, total: 60 });
    expect(state.extendedOpen).toBe(false);
  });

  it('[POEM-03] 卡片带 gradeLabel / tierLabel，正文是句子数组', () => {
    const [first] = poemState(seeded(), DAY, NOW).weekly;

    // 两个中文标签落在 utils/ 而不是 data/：页面不抄这份映射
    expect(first).toMatchObject({
      id: 'p1',
      author: '骆宾王',
      dynasty: '唐',
      grade: 1,
      tier: 'required',
      gradeLabel: '启蒙',
      tierLabel: '必背',
      learned: false,
      mastered: false,
      dueToday: false,
      step: 0,
      wrong: 0,
    });
    expect(first.content).toEqual(['鹅鹅鹅', '曲项向天歌', '白毛浮绿水', '红掌拨清波']);
  });

  it('[POEM-04] 本周三首一周内不变：学过的仍留在列表里、标成已学', () => {
    const next = studyPoem(seeded(), DAY, 'p1', true, NOW);
    const state = poemState(next, NEXT_DAY, NEXT_NOW);

    // 不落盘的话周二就变成 p2 / p3 / p4 —— 学一首冒一首，「每周三首」就没了
    expect(ids(state.weekly)).toEqual(['p1', 'p2', 'p3']);
    expect(state.weekly[0]).toMatchObject({ id: 'p1', learned: true, step: 1 });
    expect(state.weekly[1].learned).toBe(false);
  });

  it('[POEM-05] 上周三首都学过，下一周换成 p4 / p5 / p6', () => {
    const save = withPoems(
      { p1: mid(), p2: mid(), p3: mid() },
      {
        weekKey: THIS_WEEK,
        ids: ['p1', 'p2', 'p3'],
      },
    );

    expect(ids(poemState(save, NEXT_WEEK_DAY, NEXT_WEEK_NOW).weekly)).toEqual(['p4', 'p5', 'p6']);
  });

  it('[POEM-06] 上周只学了 p1，下一周是 p2 / p3 / p4：没学完的留下，只补一首新的', () => {
    // 本轮偏离线上最要紧的一条：线上窗口是 floor(天序号/7)*3 % 109，硬前进 ——
    // 缺席一周那三首要等约 8 个月才回来。没有这条断言，「按线上抄回去」不会有东西报警
    const save = withPoems({ p1: mid() }, { weekKey: THIS_WEEK, ids: ['p1', 'p2', 'p3'] });

    expect(ids(poemState(save, NEXT_WEEK_DAY, NEXT_WEEK_NOW).weekly)).toEqual(['p2', 'p3', 'p4']);
  });
});

describe('间隔表与会背判定（POEM）', () => {
  it('[POEM-07] 第一次说已会背：step 为 1、due 是明天', () => {
    const next = studyPoem(seeded(), DAY, 'p1', true, NOW);

    expect(next.learningProgress.guoxue.poems.p1).toEqual({
      step: 1,
      due: NEXT_DAY,
      wrong: 0,
      mastered: false,
    });
  });

  it('[POEM-08] 连续在到期日说已会背，due 依次是 +1 / +3 / +7 / +15 天', () => {
    // 线上那份调度是 `||=` 写的，只在首次学习时写过一次、之后永不更新，
    // 而且判定是 some(六个日期 <= 今天) —— 间隔从来没起过作用
    const dues = [
      '2026-08-13', // 08-12 + 1
      '2026-08-16', // 08-13 + 3
      '2026-08-23', // 08-16 + 7
      '2026-09-07', // 08-23 + 15
    ];

    let save = seeded();
    let key = DAY;

    for (const [i, expected] of dues.entries()) {
      const now = new Date(`${key}T19:00:00`).getTime();
      save = studyPoem(save, key, 'p1', true, now);
      const record = save.learningProgress.guoxue.poems.p1;

      expect(record.step).toBe(i + 1);
      expect(record.due).toBe(expected);
      expect(record.mastered).toBe(false);

      key = expected; // 下一次表态在到期那天（同一天不能表两次，POEM-16）
    }

    // 四个间隔都熬过来了，此时 step 是 4、还没会背
    expect(save.learningProgress.guoxue.poems.p1.step).toBe(4);
  });

  it('[POEM-09] 第五次说已会背（四个间隔全熬过）就是会背了', () => {
    const save = withPoems({ p1: { step: 4, due: DAY, wrong: 0 } });
    const next = studyPoem(save, DAY, 'p1', true, NOW);

    expect(next.learningProgress.guoxue.poems.p1).toEqual({
      step: 5,
      due: '',
      wrong: 0,
      mastered: true,
    });
    expect(poemState(next, DAY, NOW).required.mastered).toBe(1);
  });

  it('[POEM-10] 会背了的诗既不进 weekly 也不进 reviews', () => {
    const save = withPoems(
      { p1: { step: 5, due: '', wrong: 0 } },
      {
        weekKey: THIS_WEEK,
        ids: ['p1', 'p2', 'p3'],
      },
    );
    const state = poemState(save, DAY, NOW);

    expect(ids(state.weekly)).toEqual(['p2', 'p3']);
    expect(state.reviews).toEqual([]);
    expect(state.required).toMatchObject({ learned: 1, mastered: 1 });
  });

  it('[POEM-11] 说还没背下来：step 回 0、due 是今天、wrong 加 1', () => {
    const save = withPoems({ p1: { step: 3, due: DAY, wrong: 1 } });
    const next = studyPoem(save, DAY, 'p1', false, NOW);

    expect(next.learningProgress.guoxue.poems.p1).toEqual({
      step: 0,
      due: DAY,
      wrong: 2,
      mastered: false,
    });
  });
});

describe('到期判定、排序与当天去重（POEM）', () => {
  /** 本周三首固定成 p10 / p11 / p12，好让 p1 ~ p3 落在 reviews 那一段 */
  const elsewhere = { weekKey: THIS_WEEK, ids: ['p10', 'p11', 'p12'] };

  it('[POEM-12] 上一周引入、昨天到期的诗今天回到 reviews', () => {
    const save = withPoems({ p1: due(0, '2026-08-11') }, elsewhere);

    expect(ids(poemState(save, DAY, NOW).reviews)).toEqual(['p1']);
    // 过期更久的一样到期（due <= 今天，日期键字符串比较）
    const stale = withPoems({ p1: due(0, '2026-07-01') }, elsewhere);
    expect(ids(poemState(stale, DAY, NOW).reviews)).toEqual(['p1']);
  });

  it('[POEM-13] due 在明天的诗不进 reviews', () => {
    const save = withPoems({ p1: due(0, NEXT_DAY) }, elsewhere);
    const state = poemState(save, DAY, NOW);

    expect(state.reviews).toEqual([]);
    expect(state.required.learned).toBe(1);
  });

  it('[POEM-14] reviews 最多两首，说过「还没背下来」多的排最前', () => {
    const save = withPoems({ p1: due(0), p2: due(2), p3: due(0) }, elsewhere);

    expect(ids(poemState(save, DAY, NOW).reviews)).toEqual(['p2', 'p1']);
  });

  it('[POEM-15] 本周三首里今天到期的那首留在 weekly，不在 reviews 里出现第二次', () => {
    const save = withPoems({ p1: due() }, { weekKey: THIS_WEEK, ids: ['p1', 'p2', 'p3'] });
    const state = poemState(save, DAY, NOW);

    expect(state.weekly[0]).toMatchObject({ id: 'p1', learned: true, dueToday: true });
    expect(state.weekly[1].dueToday).toBe(false);
    expect(state.reviews).toEqual([]);
  });

  it('[POEM-16] 同一首诗当天第二次表态原样返回入参', () => {
    const once = studyPoem(seeded(), DAY, 'p1', true, NOW);
    const twice = studyPoem(once, DAY, 'p1', false, NOW + 1000);

    // 对象同一性，不是深相等 —— 页面靠 next === this.save 决定要不要落盘
    expect(twice).toBe(once);
    expect(twice.learningProgress.guoxue.poems.p1.step).toBe(1);
    expect(twice.days[DAY].learning.guoxue.poems).toEqual(['p1']);
  });

  it('[POEM-17] 当天表过态的诗当天不再进 reviews，明天才回来', () => {
    const save = withPoems({ p1: { step: 2, due: DAY, wrong: 0 } }, elsewhere);
    const next = studyPoem(save, DAY, 'p1', false, NOW);

    // due 是今天，但当天已表过态 —— 不拦的话它会在同一次会话里一直回到列表顶上
    expect(poemState(next, DAY, NOW).reviews).toEqual([]);
    expect(ids(poemState(next, NEXT_DAY, NEXT_NOW).reviews)).toEqual(['p1']);
  });
});

describe('国学打卡与发放（POEM）', () => {
  it('[POEM-18] 两种表态都打卡：2 星 2 粮、流水一条', () => {
    for (const recited of [true, false]) {
      const next = studyPoem(seeded(), DAY, 'p1', recited, NOW);

      // 说「还没背下来」照样发星光 —— 诚实不该比谎报亏（vision「什么算好」第 2 条）
      expect(next.days[DAY].checks.guoxue).toMatchObject({ at: NOW });
      expect(next.currency.star).toBe(2);
      expect(next.currency.petFood).toBe(2);
      expect(ledgerOf(next, DAY)).toHaveLength(1);
      expect(ledgerOf(next, DAY)[0]).toMatchObject({
        type: 'earn',
        star: 2,
        petFood: 2,
        reason: '完成：国学',
      });
      expect(poemState(next, DAY, NOW).done).toBe(true);
    }
  });

  it('[POEM-19] 国学打卡经验 +8（与 LEARN-08 同价），开心度 +1', () => {
    const base = seeded();
    const save = { ...base, pet: { ...base.pet, petExp: 0, mood: 2 } };
    const next = studyPoem(save, DAY, 'p1', true, NOW);

    expect(next.pet.petExp).toBe(8);
    expect(next.pet.mood).toBe(3);
  });

  it('[POEM-20] 当天第二首表态不重复发放', () => {
    const one = studyPoem(seeded(), DAY, 'p1', true, NOW);
    const two = studyPoem(one, DAY, 'p2', false, NOW + 1000);

    expect(two.currency.star).toBe(2);
    expect(two.pet.petExp).toBe(8);
    expect(ledgerOf(two, DAY)).toHaveLength(1);
    expect(two.days[DAY].learning.guoxue.poems).toEqual(['p1', 'p2']);
  });

  it('[POEM-21] 打卡后 checks / ledger / learning 三个兄弟键互不覆盖', () => {
    const day = studyPoem(seeded(), DAY, 'p1', true, NOW).days[DAY];

    expect(Object.keys(day).sort()).toEqual(['checks', 'learning', 'ledger']);
    expect(day.checks.guoxue).toBeDefined();
    expect(day.ledger).toHaveLength(1);
    expect(day.learning.guoxue.poems).toEqual(['p1']);
  });

  it('[POEM-22] 当天记录是一个数组，说「还没背下来」的也在里面', () => {
    // 线上是单数的 { poemId, learned, recited }，一天学两首后一首覆盖前一首
    const one = studyPoem(seeded(), DAY, 'p1', false, NOW);
    const two = studyPoem(one, DAY, 'p2', true, NOW + 1000);

    expect(two.days[DAY].learning.guoxue).toEqual({ poems: ['p1', 'p2'] });
  });
});

describe('拓展 60 首的解锁（POEM）', () => {
  /** 109 首必背的进度表，`record` 决定它们处在哪一档 */
  function allRequired(record) {
    return Object.fromEntries(
      POEMS.filter((item) => item.tier === 'required').map((item) => [item.id, record()]),
    );
  }

  it('[POEM-23] 必背没全部会背时，两个列表里都没有拓展诗', () => {
    // 109 首全「学过但没会背」：选诗池里已无未学的必背，但拓展仍不许冒出来
    const save = withPoems(allRequired(() => mid()));
    const state = poemState(save, DAY, NOW);

    expect(state.weekly).toEqual([]);
    expect(state.reviews).toEqual([]);
    expect(state.extendedOpen).toBe(false);
    expect(state.required).toMatchObject({ learned: 109, mastered: 0 });
    expect(state.extended).toMatchObject({ learned: 0, mastered: 0, total: 60 });
  });

  it('[POEM-24] 109 首必背全部会背后拓展解锁，weekly 变成 p75 起的三首', () => {
    // 线上那 60 首是永久不可达的（池子过滤 + 目录不可点两道墙）。
    // 这条规格钉住「有一条走得通的路」—— 少了它，下一个人删掉那条分支门禁不会响
    const save = withPoems(allRequired(() => ({ step: 5, due: '', wrong: 0 })));
    const state = poemState(save, DAY, NOW);

    expect(state.extendedOpen).toBe(true);
    expect(state.required).toMatchObject({ learned: 109, mastered: 109 });
    expect(ids(state.weekly)).toEqual(['p75', 'p76', 'p77']);
    expect(state.weekly.map((card) => card.tierLabel)).toEqual(['拓展', '拓展', '拓展']);
  });
});

describe('错误策略与不变式（POEM）', () => {
  it('[POEM-25] studyPoem 传不在诗库里的 id 抛 RangeError', () => {
    expect(() => studyPoem(seeded(), DAY, 'p170', true, NOW)).toThrow(RangeError);
    expect(() => studyPoem(seeded(), DAY, '', true, NOW)).toThrow(RangeError);
  });

  it('[POEM-26] studyPoem 的 now 非有限数抛 TypeError', () => {
    expect(() => studyPoem(seeded(), DAY, 'p1', true, Number.NaN)).toThrow(TypeError);
    expect(() => studyPoem(seeded(), DAY, 'p1', true, undefined)).toThrow(TypeError);
  });

  it('[POEM-27] 没有国学任务时 poemState 不抛、studyPoem 抛', () => {
    const base = seeded();
    const save = { ...base, habits: base.habits.filter((h) => h.module !== 'guoxue') };

    // 渲染路径宽容：家长删了这条任务，国学页仍要能打开
    const state = poemState(save, DAY, NOW);
    expect(state.done).toBe(false);
    expect(ids(state.weekly)).toEqual(['p1', 'p2', 'p3']);

    // 提交路径严格
    expect(() => studyPoem(save, DAY, 'p1', true, NOW)).toThrow(RangeError);
  });

  it('[POEM-28] 坏 step / wrong 在读取入口已收敛，mastered 以 step 为准', () => {
    const save = withPoems(
      {
        p1: { step: 99, due: DAY, wrong: -3, mastered: false }, // 夹到 5 = 会背
        p2: { step: -1, due: DAY, wrong: 2.6, mastered: true }, // 夹到 0，mastered 打回
        p3: { step: '2', due: DAY, wrong: undefined },
      },
      { weekKey: THIS_WEEK, ids: ['p10', 'p11', 'p12'] },
    );
    const state = poemState(save, DAY, NOW);

    // 古诗的上界是 5 不是识字的 7 —— 混成一张表的话 99 会夹到 7、永远不算会背
    expect(state.required).toMatchObject({ learned: 3, mastered: 1 });
    expect(ids(state.reviews)).toEqual(['p2', 'p3']);
    expect(state.reviews.map((card) => card.step)).toEqual([0, 0]);
    expect(state.reviews.map((card) => card.wrong)).toEqual([3, 0]);
    expect(state.reviews.map((card) => card.mastered)).toEqual([false, false]);
  });

  it('[POEM-29] poemState 的 now 非有限数时用落盘的 ids，没落盘就给空数组', () => {
    const save = withPoems({ p1: mid() }, { weekKey: THIS_WEEK, ids: ['p1', 'p2', 'p3'] });

    // 不抛错，也不去猜「本周」是哪一周
    expect(ids(poemState(save, DAY, Number.NaN).weekly)).toEqual(['p1', 'p2', 'p3']);
    expect(poemState(seeded(), DAY, undefined).weekly).toEqual([]);
  });

  it('[POEM-30] studyPoem 落盘的 ids 与 poemState 的 weekly 序列相同', () => {
    // 两条路径共用同一个选诗 helper，所以落盘的与显示的不可能不一致
    const before = ids(poemState(seeded(), DAY, NOW).weekly);
    const next = studyPoem(seeded(), DAY, 'p1', true, NOW);

    expect(next.learningProgress.guoxue.weekly).toEqual({
      weekKey: THIS_WEEK,
      ids: ['p1', 'p2', 'p3'],
    });
    expect(next.learningProgress.guoxue.weekly.ids).toEqual(before);
    expect(ids(poemState(next, DAY, NOW).weekly)).toEqual(before);
  });

  it('[POEM-31] studyPoem 不改入参，返回的是新对象', () => {
    const save = seeded();
    const snapshot = JSON.parse(JSON.stringify(save));
    const next = studyPoem(save, DAY, 'p1', true, NOW);

    expect(next).not.toBe(save);
    expect(save).toEqual(snapshot);
  });

  it('[POEM-32] poems 里的脏 id 不进任何列表，也不抛错', () => {
    const save = withPoems(
      { 不存在的诗: due(), p1: due() },
      { weekKey: THIS_WEEK, ids: ['p10', '也是脏的'] },
    );
    const state = poemState(save, DAY, NOW);

    expect(ids(state.reviews)).toEqual(['p1']);
    expect(ids(state.weekly)).toEqual(['p10']);
  });
});
