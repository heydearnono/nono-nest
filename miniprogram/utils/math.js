/**
 * 数学：30 道固定题的出题、阶段推进、数学打卡。
 *
 * 规格来源：docs/features/math/doc.md（`MATH` 区）
 *
 * 依赖方向 math.js → pet.js → point.js → habit.js → data/，与 literacy.js / poem.js 同层。
 * **不 import reward.js**（结算由 pet.js 末尾的 settleDay 负责），
 * 反过来 reward.js 也不许 import 本文件 —— 会成环，所以 `math_games` 判据
 * 直接读存档里 `rounds` 的 `correct`。
 *
 * **没有 `step` / `due`，也没有间隔表** —— 这是与识字、古诗最大的结构差别。
 * 线上数学没有复习调度，而 30 道题一共只有 30 道，「明天再见」由
 * 「优先出还没答对过的题」自然完成（glossary 的 `step` / `due` 两个词不进这一域）。
 *
 * 与线上的四处偏离（理由都在 doc.md）：
 * 1. 出题**优先没答对过的题**，不是 `天序号 % 4` 的循环 —— 那个循环与答对过什么无关。
 * 2. 打卡条件是**当天三道题都答过**（答错也算），不是线上「答对才计入」加一个
 *    刷不完的 `gamesCompleted`。
 * 3. 升阶条件是**本阶段 5 道题（含 Boss）都答对过一次**，不是「6 局对 4 局」
 *    那个可以刷同两道题的计数器。
 * 4. 选项顺序**按 `dayKey` 确定性打乱** —— 线上选项是常量，而 30 道里 20 道
 *    `answer: 1`（阶段 4、5 的十道全是），「永远点第二个」是必胜策略。
 */

import { MATH_ROUNDS, MATH_STAGES } from '../data/mathRounds.js';
import { checkAwardAndGrow } from './pet.js';

/** 每天出几道题，抄线上（界面文案「每天2题+Boss」也写着） */
const ROUNDS_PER_DAY = 3;

/** 每阶段几道题（4 普通 + 1 Boss）。升阶要这 5 道都答对过 */
const ROUNDS_PER_STAGE = 5;

/** 阶段数上界，与 `save.js` 的 `MATH_STAGE_MAX` 是同一个 6（那边夹存档，这边推进） */
const STAGE_MAX = MATH_STAGES.length;

/** 数学打卡产出的经验，与其余四个学习模块同价（`LEARN-08`） */
const EXP_PER_MATH = 8;

/** 本模块的子模块标识，用来在 `habits` 里找对应任务 */
const MODULE = 'math';

/** 题 id → 数据包下标。30 条建一次，「在不在题库里」与排序都要用它 */
const INDEX_OF = new Map(MATH_ROUNDS.map((item, i) => [item.id, i]));

/**
 * 存档里的答题记录表。缺失或坏结构时给空对象，读取方不必判空。
 *
 * 收敛已经由 `normalizeSave` 做过（`SAVE-18`），但存档也可能是调用方手拼的
 * （测试、家长端），所以读的时候仍然夹一次 —— 夹的代价是常数。
 *
 * 与 `poemsOf` 的差别：非对象的记录**整条丢掉**而不是补空记录 ——
 * 补 `correct: false` 会把「答对过」悄悄改成「没答对过」（`SAVE-18` 那段注释）。
 *
 * @param {object} save 存档
 * @returns {Record<string, { correct: boolean, wrong: number }>}
 */
function roundsOf(save) {
  const raw = save?.learningProgress?.math?.rounds;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const out = {};
  for (const [id, record] of Object.entries(raw)) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) continue;
    out[id] = { correct: record.correct === true, wrong: clampWrong(record.wrong) };
  }
  return out;
}

/**
 * 答错次数，夹成非负整数。
 *
 * @param {unknown} value 原始计数
 * @returns {number}
 */
function clampWrong(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * 当前阶段，夹到 `1` ~ `6` 的整数。坏值当 `1` 而不是抛错：`mathState` 在渲染路径上
 * （`AGENTS.md` 第 5 节第 6 条）。
 *
 * **与 `rounds` 矛盾时以本字段为准**（`MATH-32`）：`stage: 6` 而 `rounds` 是空的，
 * 表现是「在第 6 阶段」而不是打回第一阶段 —— 仲裁规则只有这一条。
 *
 * @param {object} save 存档
 * @returns {number}
 */
function stageOf(save) {
  const value = save?.learningProgress?.math?.stage;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(STAGE_MAX, Math.max(1, Math.round(value)));
}

/**
 * 当天答过的题 id。**一个数组**，与古诗那个 `poems: ['p1']` 同一形状，
 * 不是线上那个只数次数的 `{ gamesPlayed, gamesCorrect, stage }`（那个 `stage` 是死字段）。
 *
 * 它有两个读取点：打卡判据（满 3 道）与当天去重（一道题一天只答一次）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {{ rounds: string[], correct: number }}
 */
function todayOf(save, key) {
  const raw = save?.days?.[key]?.learning?.[MODULE];
  const ids = Array.isArray(raw?.rounds) ? raw.rounds.filter((id) => typeof id === 'string') : [];

  return { rounds: ids, correct: clampWrong(raw?.correct) };
}

/**
 * 找数学对应的学习任务。按 `module` 找而不是按 id —— 与 `literacy.js` / `poem.js`
 * 同一条理由（两个取值恰好相同，但那是 data/defaultHabits.js 的巧合）。
 *
 * @param {object} save 存档
 * @returns {object | null} 任务定义，没有时 `null`
 */
function habitOf(save) {
  const habits = Array.isArray(save?.habits) ? save.habits : [];
  return habits.find((item) => item.module === MODULE) ?? null;
}

/**
 * 选当天的三道题：**当前阶段的普通题里先取还没答对过的**，按数据包顺序取两道，
 * Boss 追加在末尾、永远第三道。
 *
 * `mathState` 出题与 `answerRound` 校验「这道题今天该不该能答」共用的就是这一个函数
 * —— 共用判据要共用的是函数，不是两处抄一样的规则（与古诗的 `pickWeekly` 同一条）。
 *
 * 不够两道时（这个阶段的普通题都答对过了）用已答对过的按数据包顺序补，
 * **不跨阶段借题**：线上的 `fallback` 分支跨阶段取，但那条分支永远走不到 ——
 * 每个阶段都有 4 道普通题，`normal.length === 0` 不可能成立，是死代码。
 *
 * @param {Record<string, { correct: boolean }>} rounds 答题记录表
 * @param {number} stage 当前阶段
 * @returns {object[]} 恒 3 条数据包元素（普通题两道 + Boss）
 */
function pickToday(rounds, stage) {
  const inStage = MATH_ROUNDS.filter((item) => item.stage === stage);
  const normal = inStage.filter((item) => !item.isBoss);
  const boss = inStage.filter((item) => item.isBoss);

  const fresh = normal.filter((item) => rounds[item.id]?.correct !== true);
  const solved = normal.filter((item) => rounds[item.id]?.correct === true);

  return [...fresh, ...solved].slice(0, ROUNDS_PER_DAY - boss.length).concat(boss);
}

/**
 * 本阶段答对过几道（Boss 算在里面）。升阶判据与页头的「本阶段 N/5」共用它。
 *
 * @param {Record<string, { correct: boolean }>} rounds 答题记录表
 * @param {number} stage 阶段
 * @returns {number}
 */
function clearedIn(rounds, stage) {
  return MATH_ROUNDS.filter((item) => item.stage === stage && rounds[item.id]?.correct === true)
    .length;
}

/**
 * 升阶：本阶段 5 道题（**含 Boss**）都答对过一次就 `stage + 1`，上限 6。
 *
 * **Boss 也算在 5 道里**（`MATH-17`）：漏掉它会让升阶只要 4 道普通题，
 * 而 Boss 是当天必出的第三道 —— 那条捷径每天都摆在眼前。
 *
 * 一次只推进一阶：本阶段刚满就进下一阶，下一阶的 5 道题此刻不可能都答对过
 * （它们还没出过题），所以不需要循环。
 *
 * @param {Record<string, { correct: boolean }>} rounds 答题记录表
 * @param {number} stage 当前阶段
 * @returns {number} 新阶段
 */
function nextStage(rounds, stage) {
  if (stage >= STAGE_MAX) return STAGE_MAX; // 停在 6，不会变成 7（MATH-18）
  return clearedIn(rounds, stage) >= ROUNDS_PER_STAGE ? stage + 1 : stage;
}

/**
 * 选项打乱的种子：**只吃日期键与题 id**，所以同一天同一道题的顺序恒定、跨天变化
 * （`MATH-07` / `MATH-08`）。不吃存档 —— 答过一次之后顺序跳位，孩子会以为换了题。
 *
 * 逐字符累加的 32 位整数（FNV 那一路的简化版）。不用 `Math.random()`：
 * `utils/` 是纯函数（`AGENTS.md` 第 3 节），而且页面每次 `setData` 重渲染
 * 选项都会跳位，5 岁的孩子点不下去。
 *
 * @param {string} key 日期键
 * @param {string} id 题 id
 * @returns {number} 非负 32 位整数
 */
function shuffleSeed(key, id) {
  let seed = 2166136261;
  for (const char of `${key}|${id}`) {
    seed = (seed ^ char.codePointAt(0)) >>> 0;
    seed = (seed * 16777619) >>> 0;
  }
  return seed;
}

/**
 * 种子化的 Fisher-Yates 打乱，给出打乱后的选项与正确项的新下标。
 *
 * **不是 `sort(() => seed - 0.5)`**：那个的结果不是均匀分布，而且 V8 的排序
 * 对短数组几乎不动 —— 三个选项的题会有很大概率原样返回。
 *
 * 线性同余（Numerical Recipes 那组参数）在每一步取下一个随机数：种子固定，
 * 序列就固定，同一天同一道题因此得到同一个排列。
 *
 * 取的是状态的**高位**（`state / 2 ** 32` 归一化后再乘区间长度）而不是 `state % (i + 1)`：
 * 模 2³² 的 LCG 低位周期极短 —— 低 1 位只有两种取值交替，二选一的题（`compare` 的
 * 「左边 / 右边」）会因此**永远不换位**。高位才是均匀的那一半。
 *
 * @param {string[]} options 原始选项
 * @param {number} answer 原始正确下标
 * @param {number} seed 种子
 * @returns {{ options: string[], answerIndex: number }}
 */
function shuffleOptions(options, answer, seed) {
  const out = options.slice();
  let index = answer;
  let state = seed;

  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = Math.floor((state / 4294967296) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
    // 跟着正确项走：它被换到哪里，answerIndex 就是哪里
    if (index === i) index = j;
    else if (index === j) index = i;
  }

  return { options: out, answerIndex: index };
}

/**
 * 把数据包里的一条转成卡片。`correct` / `wrong` / `answered` 三个都在这一层算好 ——
 * 页面不读存档、不判断「今天答过没有」（`AGENTS.md` 第 3 节）。
 *
 * `answerIndex` 出现在读取入口的输出里，也就是页面的 data 里可见。这不是漏洞
 * 而是取舍（doc.md）：页面要在点击的瞬间给出「太棒啦 ⭐ / 再试一次哦～」的反馈。
 *
 * @param {object} item 数据包元素
 * @param {{ correct: boolean, wrong: number } | undefined} record 答题记录
 * @param {boolean} answered 今天答过了
 * @param {string} key 日期键，打乱的种子之一
 * @returns {object} 卡片
 */
function cardOf(item, record, answered, key) {
  const shuffled = shuffleOptions(item.options, item.answer, shuffleSeed(key, item.id));

  return {
    id: item.id,
    stage: item.stage,
    kind: item.kind,
    title: item.title,
    question: item.question,
    // 五种 kind 各带自己的插图字段，缺的落空值 —— 页面不写 `item.items ?? ''`
    items: item.items ?? '',
    target: item.target ?? 0,
    leftSide: item.leftSide ?? null,
    rightSide: item.rightSide ?? null,
    sequence: item.sequence ?? [],
    options: shuffled.options,
    answerIndex: shuffled.answerIndex,
    isBoss: item.isBoss,
    correct: record?.correct === true,
    wrong: record?.wrong ?? 0,
    answered,
  };
}

/**
 * 数学页的唯一读取入口。**不抛错**（渲染路径宽容）：`habits` 里没有数学任务时
 * `done` 为 `false`、`stage` 是坏值时收敛、`rounds` 里有不在题库里的 id
 * （导入来的脏数据）时那条不进卡片、也不算进 `solved`（`MATH-33`）。
 *
 * `now` 只为签名与 `literacyState` / `poemState` 一致，本函数**不用它** ——
 * 数学没有到期日要与「今天」比较，日期全靠 `key`（`MATH-34`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {number} now 毫秒时间戳，由页面层传入（本函数不用）
 * @returns {{ stage: { stage: number, name: string, desc: string, cleared: number, total: number },
 *             rounds: object[], todayCount: number, solved: number, total: number, done: boolean }}
 */
export function mathState(save, key, now) {
  void now;

  const rounds = roundsOf(save);
  const stage = stageOf(save);
  const today = todayOf(save, key);
  const answered = new Set(today.rounds);

  const meta = MATH_STAGES.find((item) => item.stage === stage) ?? MATH_STAGES[0];
  const habit = habitOf(save);
  const checks = save?.days?.[key]?.checks;

  return {
    stage: {
      stage,
      name: meta.name,
      desc: meta.desc,
      cleared: clearedIn(rounds, stage),
      total: ROUNDS_PER_STAGE,
    },
    // 当天答过的题**留在列表里**并标 answered（`MATH-14`）：去掉会让
    // 「第 3 题 / 共 3 题」的进度条在孩子眼前缩短
    rounds: pickToday(rounds, stage).map((item) =>
      cardOf(item, rounds[item.id], answered.has(item.id), key),
    ),
    todayCount: today.rounds.filter((id) => INDEX_OF.has(id)).length,
    // 脏 id 不算进 solved：题库里没有的题渲染不出卡片，也就不该出现在「答对 N/30」里
    solved: MATH_ROUNDS.filter((item) => rounds[item.id]?.correct === true).length,
    total: MATH_ROUNDS.length,
    done: habit !== null && typeof checks === 'object' && checks !== null && habit.id in checks,
  };
}

/**
 * 答一道题：`choice` 是**打乱后**的选项下标（页面从卡片上拿到的那个顺序）。
 *
 * **答对答错都算答过、都写记录、都可能打卡**（`MATH-11` / `MATH-23`）：
 * 「再试一次哦～」是明天再见的意思，不是当场重答 —— 与识字「还不太会」、
 * 古诗「还没背下来」同一条（答错不是惩罚，`docs/vision.md`「什么算好」第 2 条）。
 *
 * `correct` 是**终态**：答对过之后再答错也不退回（`MATH-13`），`wrong` 照样累加。
 * 五岁孩子那 30 道题的目的是「都做对过一次」，不是保持熟练度。
 *
 * **当天重复答同一道题原样返回**（对象同一性，`MATH-15`）—— 这条同时封住线上那条
 * 「连点十次同一道题解锁成就」的刷分路径（doc.md 缺陷 5）。
 *
 * **发放先行、记录后写**：`day` 从发放后的存档里取，`checks` / `ledger` / `learning`
 * 三个兄弟键就不可能互相覆盖（`MATH-24`，与 `gradeChar` / `studyPoem` 同一条）。
 *
 * 升阶在写记录之前算：本阶段 5 道（含 Boss）都答对过就 `stage + 1`。
 * **不返回「升阶了没有」** —— 页面比较前后 `stage` 自己判断（`MATH-19`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} roundId 题 id
 * @param {number} choice 打乱后的选项下标
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；当天已答过这道题时返回入参本身
 * @throws {RangeError} 题不在题库里、`choice` 不是合法下标，或 `habits` 里没有数学任务
 * @throws {TypeError} `now` 非有限数
 */
export function answerRound(save, key, roundId, choice, now) {
  if (!INDEX_OF.has(roundId)) {
    throw new RangeError(`题 ${JSON.stringify(roundId)} 不在题库里`);
  }
  const item = MATH_ROUNDS[INDEX_OF.get(roundId)];
  if (!Number.isInteger(choice) || choice < 0 || choice >= item.options.length) {
    throw new RangeError(`choice 必须是 0 ~ ${item.options.length - 1} 的整数下标，收到 ${choice}`);
  }
  const habit = habitOf(save);
  if (habit === null) {
    throw new RangeError(`habits 里没有 module 为 ${JSON.stringify(MODULE)} 的任务`);
  }
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const today = todayOf(save, key);
  if (today.rounds.includes(roundId)) return save;

  const rounds = roundsOf(save);
  const prev = rounds[roundId];

  // 判定**统一走 answer 下标比较**：线上 sort 那条字符串比较的旁路没有了，
  // 于是 m2-2 的矛盾与 count 题恒答对两个缺陷一起消失（doc.md 缺陷 1/2/3）
  const { answerIndex } = shuffleOptions(item.options, item.answer, shuffleSeed(key, roundId));
  const right = choice === answerIndex;

  const nextRounds = {
    ...rounds,
    [roundId]: {
      correct: prev?.correct === true || right, // 终态：答对过就一直是 true
      wrong: (prev?.wrong ?? 0) + (right ? 0 : 1),
    },
  };

  const stage = stageOf(save);
  const scheduled = {
    ...save,
    learningProgress: {
      ...save.learningProgress,
      math: { rounds: nextRounds, stage: nextStage(nextRounds, stage) },
    },
  };

  // 打卡条件是「当天答满 3 道」，答错也算（`MATH-22` / `MATH-23`）。
  // 第 3 道之前不发放；恒 3 道加当天去重让「第 4 道」不存在，所以只发一次
  const answeredToday = [...today.rounds, roundId];
  const awarded =
    answeredToday.length >= ROUNDS_PER_DAY
      ? checkAwardAndGrow(scheduled, key, habit.id, now, EXP_PER_MATH)
      : scheduled;
  const day = awarded.days?.[key] ?? {};

  return {
    ...awarded,
    days: {
      ...awarded.days,
      [key]: {
        ...day,
        learning: {
          ...day.learning,
          [MODULE]: { rounds: answeredToday, correct: today.correct + (right ? 1 : 0) },
        },
      },
    },
  };
}
