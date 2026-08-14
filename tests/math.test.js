import { describe, expect, it } from 'vitest';

import { MATH_ROUNDS, MATH_STAGES } from '../miniprogram/data/mathRounds.js';
import { seedHabits } from '../miniprogram/utils/habit.js';
import { answerRound, mathState } from '../miniprogram/utils/math.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
// math-10 的判据本轮才修对（字段名写错），断言放在数学这一侧 —— 造十道答对的题最方便
import { achievementState, unlockAchievements } from '../miniprogram/utils/reward.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/math/doc.md（`MATH` 区）
// 阶段 1 的五道题按数据包顺序是 m1-1 / m1-2 / m1-boss / m1-3 / m1-4
// —— Boss 排在第三位，出题时仍追加到末尾（顺序照搬线上，Boss 的位置由 math.js 决定）。
const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();
const NEXT_DAY = '2026-08-13';
const NEXT_NOW = new Date(2026, 7, 13, 9, 0, 0, 0).getTime();

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 往存档里塞一张答题记录表（不走 answerRound，直接构造） */
function withRounds(rounds, stage = 1, save = seeded()) {
  return { ...save, learningProgress: { math: { rounds, stage } } };
}

/** 一条「答对过」的记录 */
function solved(wrong = 0) {
  return { correct: true, wrong };
}

/** 只取卡片上的 id */
function ids(cards) {
  return cards.map((card) => card.id);
}

/** 从卡片上读打乱后的正确下标 —— 测试也不许自己算 answer */
function rightChoice(save, key, roundId, now = NOW) {
  const card = mathState(save, key, now).rounds.find((item) => item.id === roundId);
  return card.answerIndex;
}

/** 打乱后的一个错误下标 */
function wrongChoice(save, key, roundId, now = NOW) {
  const card = mathState(save, key, now).rounds.find((item) => item.id === roundId);
  return (card.answerIndex + 1) % card.options.length;
}

/** 答对一道题（choice 从卡片上取，不硬编码） */
function answerRight(save, key, roundId, now = NOW) {
  return answerRound(save, key, roundId, rightChoice(save, key, roundId, now), now);
}

/** 答错一道题 */
function answerWrong(save, key, roundId, now = NOW) {
  return answerRound(save, key, roundId, wrongChoice(save, key, roundId, now), now);
}

describe('题库本身（MATH）', () => {
  it('[MATH-01] 30 条 / 6 条，每阶段 5 条（4 普通 + 1 Boss），id 形状对', () => {
    expect(MATH_ROUNDS).toHaveLength(30);
    expect(MATH_STAGES).toHaveLength(6);
    expect(MATH_STAGES.map((item) => item.stage)).toEqual([1, 2, 3, 4, 5, 6]);

    for (const { stage } of MATH_STAGES) {
      const group = MATH_ROUNDS.filter((item) => item.stage === stage);
      expect(group).toHaveLength(5);
      expect(group.filter((item) => item.isBoss)).toHaveLength(1);
      expect(group.map((item) => item.id).sort()).toEqual(
        [`m${stage}-1`, `m${stage}-2`, `m${stage}-3`, `m${stage}-4`, `m${stage}-boss`].sort(),
      );
    }

    expect(new Set(MATH_ROUNDS.map((item) => item.id)).size).toBe(30);
  });

  it('[MATH-02] 30 条都有 isBoss 键，answer 都是 options 的合法下标', () => {
    // 线上只有 6 道 Boss 带这个字段，普通题没有这个键 —— 本仓库补齐（不是改值）
    for (const item of MATH_ROUNDS) {
      expect(typeof item.isBoss).toBe('boolean');
      expect(Number.isInteger(item.answer)).toBe(true);
      expect(item.answer).toBeGreaterThanOrEqual(0);
      expect(item.answer).toBeLessThan(item.options.length);
    }

    expect(MATH_ROUNDS.filter((item) => item.isBoss)).toHaveLength(6);
    // 「永远点第二个」为什么是必胜策略：20 道 answer 为 1，阶段 4 / 5 的十道全是
    expect(MATH_ROUNDS.filter((item) => item.answer === 1)).toHaveLength(20);
    expect(
      MATH_ROUNDS.filter((item) => item.stage === 4 || item.stage === 5).every(
        (item) => item.answer === 1,
      ),
    ).toBe(true);
  });
});

describe('每天三道的出题（MATH）', () => {
  it('[MATH-03] 空存档在第一阶段，页头的两个分子都是 0', () => {
    const state = mathState(seeded(), DAY, NOW);

    expect(state.stage.stage).toBe(1);
    expect(state.stage.name).toBe('数感');
    expect(state.stage.desc).toBe('认识数量，比较多少');
    expect(state.stage.cleared).toBe(0);
    expect(state.stage.total).toBe(5);
    expect(state.solved).toBe(0);
    expect(state.total).toBe(30);
    expect(state.todayCount).toBe(0);
    expect(state.done).toBe(false);
  });

  it('[MATH-04] rounds 恒 3 张，Boss 永远最后一张', () => {
    const state = mathState(seeded(), DAY, NOW);

    // 数据包里 m1-boss 排在第三位，出题时仍追加到末尾
    expect(ids(state.rounds)).toEqual(['m1-1', 'm1-2', 'm1-boss']);
    expect(state.rounds.at(-1).isBoss).toBe(true);
    expect(state.rounds.filter((card) => card.isBoss)).toHaveLength(1);
  });

  it('[MATH-05] 答对过的题让位给没答对过的', () => {
    // 线上按天序号取（4 天一循环），与答对过什么无关 —— 这是偏离线上最要紧的一条
    const state = mathState(withRounds({ 'm1-1': solved() }), DAY, NOW);

    expect(ids(state.rounds)).toEqual(['m1-2', 'm1-3', 'm1-boss']);
    expect(state.stage.cleared).toBe(1);
    expect(state.solved).toBe(1);
  });

  it('[MATH-06] 本阶段普通题都答对过时用已答对的补，不跨阶段借题', () => {
    const save = withRounds({
      'm1-1': solved(),
      'm1-2': solved(),
      'm1-3': solved(),
      'm1-4': solved(),
    });
    const state = mathState(save, DAY, NOW);

    // 仍恒 3 张，按数据包顺序补 —— 线上那条跨阶段的 fallback 分支是死代码
    expect(ids(state.rounds)).toEqual(['m1-1', 'm1-2', 'm1-boss']);
    expect(state.rounds.every((card) => card.stage === 1)).toBe(true);
    expect(state.stage.cleared).toBe(4);
  });
});

describe('选项按 dayKey 确定性打乱（MATH）', () => {
  it('[MATH-07] 同一天两次 mathState，每张卡的 options 顺序相同', () => {
    // 只有这一条会被「干脆不打乱」蒙过 —— 所以它与 MATH-08 必须成对存在
    const a = mathState(seeded(), DAY, NOW);
    const b = mathState(seeded(), DAY, NOW + 3_600_000);

    for (const [i, card] of a.rounds.entries()) {
      expect(card.options).toEqual(b.rounds[i].options);
      expect(card.answerIndex).toBe(b.rounds[i].answerIndex);
    }
  });

  it('[MATH-08] 相邻两天顺序不同，但正确答案的文案两天一致', () => {
    // 只有这一条会被 Math.random() 蒙过
    const today = mathState(seeded(), DAY, NOW).rounds;
    const tomorrow = mathState(seeded(), NEXT_DAY, NEXT_NOW).rounds;

    const pick = (cards, id) => cards.find((card) => card.id === id);
    const changed = ['m1-1', 'm1-2', 'm1-boss'].filter((id) => {
      const a = pick(today, id);
      const b = pick(tomorrow, id);
      // 打乱不改答案：两天点到的都是同一个文案
      expect(a.options[a.answerIndex]).toBe(b.options[b.answerIndex]);
      return a.options.join() !== b.options.join();
    });

    // 三道题里至少有一道换了顺序（两个二选一的题各有 1/2 概率原样，恒定不动才是 bug）
    expect(changed.length).toBeGreaterThan(0);
  });

  it('[MATH-09] options 是原 options 的排列，answerIndex 在合法范围内', () => {
    for (const card of mathState(seeded(), DAY, NOW).rounds) {
      const origin = MATH_ROUNDS.find((item) => item.id === card.id);

      expect(card.options.slice().sort()).toEqual(origin.options.slice().sort());
      expect(card.options).toHaveLength(origin.options.length);
      expect(card.answerIndex).toBeGreaterThanOrEqual(0);
      expect(card.answerIndex).toBeLessThan(card.options.length);
      // 打乱后那个下标指的仍是原来那个正确文案
      expect(card.options[card.answerIndex]).toBe(origin.options[origin.answer]);
    }
  });
});

describe('答一道题（MATH）', () => {
  it('[MATH-10] 答对写 { correct: true, wrong: 0 }', () => {
    const next = answerRight(seeded(), DAY, 'm1-1');

    expect(next.learningProgress.math.rounds['m1-1']).toEqual({ correct: true, wrong: 0 });
  });

  it('[MATH-11] 答错也算答过：correct 为 false、wrong 为 1', () => {
    const next = answerWrong(seeded(), DAY, 'm1-1');

    expect(next.learningProgress.math.rounds['m1-1']).toEqual({ correct: false, wrong: 1 });
    expect(next.days[DAY].learning.math.rounds).toEqual(['m1-1']);
  });

  it('[MATH-12] 先答错、后一天答对，correct 变真而 wrong 不清零', () => {
    const one = answerWrong(seeded(), DAY, 'm1-1');
    const two = answerRight(one, NEXT_DAY, 'm1-1', NEXT_NOW);

    expect(two.learningProgress.math.rounds['m1-1']).toEqual({ correct: true, wrong: 1 });
  });

  it('[MATH-13] 已答对过的题再答错，correct 仍是 true（终态）', () => {
    // 用 Boss 而不是普通题：Boss 每天必出（`MATH-04`），所以「答对过的题第二天又答一次」
    // 这条路径在 Boss 上是天天走得到的 —— 普通题要等本阶段四道都答对过才回来（`MATH-06`）
    const one = answerRight(seeded(), DAY, 'm1-boss');
    const two = answerWrong(one, NEXT_DAY, 'm1-boss', NEXT_NOW);

    expect(two.learningProgress.math.rounds['m1-boss']).toEqual({ correct: true, wrong: 1 });
  });

  it('[MATH-14] 当天答过的题仍在三道里，标 answered', () => {
    // 去掉会让「第 3 题 / 共 3 题」的进度条在孩子眼前缩短
    const next = answerRight(seeded(), DAY, 'm1-1');
    const state = mathState(next, DAY, NOW);

    expect(ids(state.rounds)).toEqual(['m1-2', 'm1-3', 'm1-boss']);
    expect(state.todayCount).toBe(1);

    // 答对过的题让位（MATH-05）之后 m1-1 不在当天三道里了，
    // 但答错的题会留在原位并标 answered
    const wrongOne = answerWrong(seeded(), DAY, 'm1-1');
    const wrongState = mathState(wrongOne, DAY, NOW);

    expect(ids(wrongState.rounds)).toEqual(['m1-1', 'm1-2', 'm1-boss']);
    expect(wrongState.rounds[0].answered).toBe(true);
    expect(wrongState.rounds[1].answered).toBe(false);
  });

  it('[MATH-15] 当天第二次答同一道题原样返回（对象同一性）', () => {
    // 这条同时封住线上「连点十次同一道题解锁 math-10」那条刷分路径
    const one = answerRight(seeded(), DAY, 'm1-1');
    const two = answerRound(one, DAY, 'm1-1', 0, NOW + 1000);

    expect(two).toBe(one);
    expect(two.learningProgress.math.rounds['m1-1'].wrong).toBe(0);
  });
});

describe('阶段推进（MATH）', () => {
  /** 把本阶段五道题里的前 n 道标成答对过 */
  function clearedStage(stage, count = 5) {
    const rounds = {};
    for (const item of MATH_ROUNDS.filter((r) => r.stage === stage).slice(0, count)) {
      rounds[item.id] = solved();
    }
    return rounds;
  }

  it('[MATH-16] 本阶段 5 道（含 Boss）都答对过就升到第 2 阶段', () => {
    // 五道里最后一道走 answerRound，好断言升阶发生在写记录的那一次
    const rounds = clearedStage(1);
    delete rounds['m1-4'];
    const save = withRounds(rounds);
    const next = answerRight(save, DAY, 'm1-4');

    expect(next.learningProgress.math.stage).toBe(2);

    const state = mathState(next, DAY, NOW);
    expect(state.stage.name).toBe('比较排序');
    expect(state.stage.cleared).toBe(0);
    expect(state.stage.total).toBe(5);
    expect(ids(state.rounds)).toEqual(['m2-1', 'm2-2', 'm2-boss']);
  });

  it('[MATH-17] 4 道普通题答对而 Boss 没答对时停在第 1 阶段', () => {
    // Boss 也算在 5 道里 —— 漏掉它升阶只要 4 道，而 Boss 是当天必出的第三道
    const save = withRounds({
      'm1-1': solved(),
      'm1-2': solved(),
      'm1-3': solved(),
      'm1-4': solved(),
      'm1-boss': { correct: false, wrong: 2 },
    });
    const next = answerWrong(save, DAY, 'm1-boss');

    expect(next.learningProgress.math.stage).toBe(1);
    expect(mathState(next, DAY, NOW).stage.cleared).toBe(4);
  });

  it('[MATH-18] 第 6 阶段全答对后停在 6，不会变成 7', () => {
    const rounds = { ...clearedStage(6) };
    delete rounds['m6-4'];
    const save = withRounds(rounds, 6);
    const next = answerRight(save, DAY, 'm6-4');

    expect(next.learningProgress.math.stage).toBe(6);
    expect(mathState(next, DAY, NOW).stage.cleared).toBe(5);
  });

  it('[MATH-19] 升阶那一次前后的 stage 从 1 变 2（页面靠这个差值弹 toast）', () => {
    const rounds = clearedStage(1);
    delete rounds['m1-4'];
    const before = withRounds(rounds);
    const after = answerRight(before, DAY, 'm1-4');

    // 存档里没有第二个「刚升阶了」字段，也没有第二个返回值
    expect(before.learningProgress.math.stage).toBe(1);
    expect(after.learningProgress.math.stage).toBe(2);
    expect(Object.keys(after.learningProgress.math).sort()).toEqual(['rounds', 'stage']);
  });
});

describe('数学打卡（MATH）', () => {
  /** 当天答满三道（默认全答对） */
  function threeAnswered(save = seeded(), right = true) {
    let next = save;
    let now = NOW;
    // 每答一道就重新问一次当天该出哪三道 —— 答对过的题会让位（MATH-05）
    for (let i = 0; i < 3; i += 1) {
      const [card] = mathState(next, DAY, now).rounds.filter((item) => !item.answered);
      next = right ? answerRight(next, DAY, card.id, now) : answerWrong(next, DAY, card.id, now);
      now += 1000;
    }
    return next;
  }

  it('[MATH-20] 当天答满 3 道打卡：2 星 2 粮，流水「完成：数学」', () => {
    const next = threeAnswered();
    const habit = next.habits.find((item) => item.module === 'math');

    expect(next.days[DAY].checks[habit.id]).toBeDefined();
    expect(next.currency.star).toBe(2);
    expect(next.currency.petFood).toBe(2);
    expect(ledgerOf(next, DAY)).toHaveLength(1);
    expect(ledgerOf(next, DAY)[0]).toMatchObject({
      type: 'earn',
      star: 2,
      petFood: 2,
      reason: '完成：数学',
    });
  });

  it('[MATH-21] 数学打卡经验 +8（与 LEARN-08 同价），开心度 +1', () => {
    const base = seeded();
    const next = threeAnswered({ ...base, pet: { ...base.pet, petExp: 0, mood: 2 } });

    expect(next.pet.petExp).toBe(8);
    expect(next.pet.mood).toBe(3);
  });

  it('[MATH-22] 当天只答 2 道不打卡、不发放', () => {
    const one = answerRight(seeded(), DAY, 'm1-1');
    const two = answerRight(one, DAY, 'm1-2', NOW + 1000);

    expect(two.days[DAY].checks).toBeUndefined();
    expect(two.currency.star).toBe(0);
    expect(ledgerOf(two, DAY)).toEqual([]);
    expect(mathState(two, DAY, NOW).done).toBe(false);
  });

  it('[MATH-23] 三道全答错照样打卡照样发放', () => {
    // 答错不是惩罚（vision「什么算好」第 2 条）—— 线上要答对才计入
    const next = threeAnswered(seeded(), false);

    expect(mathState(next, DAY, NOW).done).toBe(true);
    expect(next.currency.star).toBe(2);
    expect(next.days[DAY].learning.math.correct).toBe(0);
    expect(next.days[DAY].learning.math.rounds).toHaveLength(3);
  });

  it('[MATH-24] 打卡后 checks / ledger / learning 三个兄弟键互不覆盖', () => {
    const day = threeAnswered().days[DAY];

    expect(Object.keys(day).sort()).toEqual(['checks', 'learning', 'ledger']);
    expect(day.ledger).toHaveLength(1);
    expect(day.learning.math.rounds).toHaveLength(3);
  });

  it('[MATH-25] 当天记录是 { rounds, correct }，答错的 id 也在 rounds 里', () => {
    const one = answerWrong(seeded(), DAY, 'm1-1');
    const two = answerRight(one, DAY, 'm1-2', NOW + 1000);

    // 线上那个死掉的 stage 字段不搬
    expect(two.days[DAY].learning.math).toEqual({ rounds: ['m1-1', 'm1-2'], correct: 1 });
  });

  it('[MATH-26] 打卡当次之后不重复发放（当天去重让第 4 道不存在）', () => {
    const three = threeAnswered();
    const again = answerRound(three, DAY, three.days[DAY].learning.math.rounds[0], 0, NOW + 9000);

    expect(again).toBe(three);
    expect(again.currency.star).toBe(2);
    expect(ledgerOf(again, DAY)).toHaveLength(1);
  });
});

describe('answerRound 的严格边界（MATH）', () => {
  it('[MATH-27] 不在题库里的 roundId 抛 RangeError', () => {
    for (const id of ['m9-9', 'm1', '', 'M1-1', undefined, 42]) {
      expect(() => answerRound(seeded(), DAY, id, 0, NOW)).toThrow(RangeError);
    }
  });

  it('[MATH-28] choice 不是合法下标时抛 RangeError', () => {
    for (const choice of [-1, 99, '0', 1.5, Number.NaN, undefined, null]) {
      expect(() => answerRound(seeded(), DAY, 'm1-1', choice, NOW)).toThrow(RangeError);
    }
    // m1-2 只有两个选项：2 越界，而它对 m1-1（三个选项）是合法的
    expect(() => answerRound(seeded(), DAY, 'm1-2', 2, NOW)).toThrow(RangeError);
    expect(() => answerRound(seeded(), DAY, 'm1-1', 2, NOW)).not.toThrow();
  });

  it('[MATH-29] now 非有限数抛 TypeError', () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, '2026-08-12', undefined, null]) {
      expect(() => answerRound(seeded(), DAY, 'm1-1', 0, now)).toThrow(TypeError);
    }
  });

  it('[MATH-30] habits 里没有数学任务：mathState 不抛、answerRound 抛 RangeError', () => {
    const save = { ...defaultSave(), habits: [] };

    expect(() => mathState(save, DAY, NOW)).not.toThrow();
    expect(mathState(save, DAY, NOW).done).toBe(false);
    expect(() => answerRound(save, DAY, 'm1-1', 0, NOW)).toThrow(RangeError);
  });
});

describe('mathState 的宽容路径（MATH）', () => {
  it('[MATH-31] 脏 stage 与脏 wrong 被收敛，不抛错', () => {
    for (const [stage, expected] of [
      [99, 6],
      [-1, 1],
      ['2', 1],
      [Number.NaN, 1],
      [undefined, 1],
    ]) {
      const save = withRounds({ 'm1-1': { correct: true, wrong: -3 } }, stage);
      const state = mathState(save, DAY, NOW);

      expect(state.stage.stage).toBe(expected);
      expect(state.solved).toBe(1);
    }

    const card = mathState(withRounds({ 'm1-2': { correct: true, wrong: -3 } }), DAY, NOW)
      .rounds[0];
    expect(card.wrong).toBe(0);
  });

  it('[MATH-32] stage 为 6 而 rounds 为空（矛盾）时以 stage 为准', () => {
    // 仲裁规则只有一条：不抛错、不打回第一阶段
    const state = mathState(withRounds({}, 6), DAY, NOW);

    expect(state.stage.stage).toBe(6);
    expect(state.stage.name).toBe('钟表人民币');
    expect(ids(state.rounds)).toEqual(['m6-1', 'm6-2', 'm6-boss']);
    expect(state.stage.cleared).toBe(0);
  });

  it('[MATH-33] rounds 里的脏 id 不进卡片、不算进 solved', () => {
    // 导入来的脏数据。save.js 不校验 id（不 import data/），由本层挑掉
    const save = withRounds({ 'm1-1': solved(), 'm9-9': solved(), 天: solved() });
    const state = mathState(save, DAY, NOW);

    expect(state.solved).toBe(1);
    expect(ids(state.rounds)).toEqual(['m1-2', 'm1-3', 'm1-boss']);
    expect(ids(state.rounds)).not.toContain('m9-9');
  });

  it('[MATH-34] mathState 的 now 非有限数不抛错（本函数只用 key）', () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '昨天']) {
      expect(() => mathState(seeded(), DAY, now)).not.toThrow();
      expect(ids(mathState(seeded(), DAY, now).rounds)).toEqual(['m1-1', 'm1-2', 'm1-boss']);
    }
  });

  it('[MATH-35] answerRound 不改传入的 save', () => {
    const save = seeded();
    const snapshot = JSON.parse(JSON.stringify(save));

    const next = answerRight(save, DAY, 'm1-1');

    expect(save).toEqual(snapshot);
    expect(next).not.toBe(save);
    expect(save.learningProgress.math.rounds).toEqual({});
  });
});

describe('顺带修的 math-10 判据（MATH）', () => {
  it('[MATH-36] 答对过 10 道题后 math-10 解锁', () => {
    // 本轮之前判据读的是 learningProgress.math.games —— 那个字段线上叫 gamesCompleted、
    // 本仓库叫 rounds，两边都没有 games。进度恒 0 让门禁与 ACHV-06 都没能发现
    const rounds = Object.fromEntries(MATH_ROUNDS.slice(0, 10).map((item) => [item.id, solved()]));
    const save = withRounds(rounds, 3);
    const list = achievementState(save, DAY, NOW);
    const math10 = list.find((item) => item.id === 'math-10');

    expect(math10.progress).toBe(10);
    expect(math10.threshold).toBe(10);
    expect(unlockAchievements(save, DAY, NOW).achievements).toContain('math-10');

    // 答错的题不算：数的是「答对过哪些题」而不是「答了几次」（线上那个可以无限刷）
    const wrongOnly = withRounds(
      Object.fromEntries(
        MATH_ROUNDS.slice(0, 10).map((item) => [item.id, { correct: false, wrong: 9 }]),
      ),
    );
    expect(
      achievementState(wrongOnly, DAY, NOW).find((item) => item.id === 'math-10').progress,
    ).toBe(0);
  });
});
