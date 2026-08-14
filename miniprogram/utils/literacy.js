/**
 * 识字：2000 字库的取字、复习调度、识字打卡。
 *
 * 规格来源：docs/features/literacy/doc.md（`LITERACY` 区）
 *
 * 依赖方向 literacy.js → pet.js → point.js → habit.js → data/，与 learning.js 同层。
 *
 * **一个字一条记录，不是五个平行结构。** 线上把进度摊成 learnedChars / reviewChars /
 * masteredChars / charReviewSchedule / charWrongCounts 五份，于是「已掌握」与「待复习」
 * 两个列表可以同时含同一个字、learnedChars 写了没人读、错误数被两个循环各减一次。
 * 这里是 chars[字] = { step, due, wrong }，四个状态都从这一条记录推出来。
 *
 * **与线上最大的偏离：间隔表真的当间隔用。** 线上一次评分把六个到期日一次性写进去，
 * 而到期判定是 some(d <= 今天) —— 最早那个永远说话，实际间隔恒为 1 天，
 * 于是每个学过的字每天都回到上限 8 的队列，学到第 20 个字以后老字再也轮不到。
 * 这里存一个到期日加一个档位（LITERACY-05），理由见 doc.md。
 */

import { CHAR_EMOJI, CHARACTERS } from '../data/characters.js';
import { dayKeyAfter } from './dayKey.js';
import { checkAwardAndGrow } from './pet.js';

/** 复习间隔（天），六个数字抄线上，改的只是「让它们真的当间隔用」 */
const REVIEW_STEPS = [1, 2, 4, 7, 14, 30];

/**
 * 走完间隔表后的档位，表示已掌握：不再进任何队列，`due` 置空。
 *
 * `step` 是「连着答对了几次」而不是间隔表的下标 —— 差一位是故意的：
 * `step` 为 `1`（第一次答对）等 `REVIEW_STEPS[0]` 天，于是 `0` 空出来
 * 单独表示「上次答错了，今天重来」，不必再加一个字段区分它与刚学的字。
 */
const MASTERED_STEP = REVIEW_STEPS.length + 1;

/** 每天引入的新字数，抄线上（界面也写「今日新字 N/2」） */
const DAILY_NEW = 2;

/** 复习队列的上限，抄线上的 `slice(0, 8)` */
const REVIEW_LIMIT = 8;

/** 识字打卡产出的经验，与其余四个学习模块同价（`LEARN-08`） */
const EXP_PER_LITERACY = 8;

/** 本模块的子模块标识，用来在 `habits` 里找对应任务 */
const MODULE = 'literacy';

/** 字 → 语料下标。2000 条建一次，emoji 与排序都要用它 */
const INDEX_OF = new Map(CHARACTERS.map((item, i) => [item.char, i]));

/**
 * 存档里的识字进度表。缺失或坏结构时给空对象，读取方不必判空。
 *
 * 三个字段的收敛已经由 `normalizeSave` 做过（`SAVE-13`），但存档也可能是
 * 调用方手拼的（测试、家长端），所以读的时候仍然夹一次 —— 夹的代价是常数。
 *
 * @param {object} save 存档
 * @returns {Record<string, { step: number, due: string, wrong: number }>}
 */
function charsOf(save) {
  const raw = save?.learningProgress?.literacy?.chars;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const out = {};
  for (const [char, record] of Object.entries(raw)) {
    if (typeof record !== 'object' || record === null) continue;
    out[char] = {
      step: clampStep(record.step),
      due: typeof record.due === 'string' ? record.due : '',
      wrong: clampWrong(record.wrong),
    };
  }
  return out;
}

/**
 * 档位夹到 `0` ~ `7` 的整数。坏值当 `0`（从头学）而不是抛错：
 * `literacyState` 在渲染路径上（`AGENTS.md` 第 5 节第 6 条）。
 *
 * @param {unknown} value 原始档位
 * @returns {number}
 */
function clampStep(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MASTERED_STEP, Math.max(0, Math.round(value)));
}

/**
 * 错误数夹成非负整数。
 *
 * @param {unknown} value 原始错误数
 * @returns {number}
 */
function clampWrong(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * 当天的识字记录：`{ newChars, reviewed }`。两个列表记的是「今天评过」，
 * 不是「今天答对了」—— 它们要挡住同一个字当天被重复评分（`LITERACY-13`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {{ newChars: string[], reviewed: string[] }}
 */
function todayOf(save, key) {
  const record = save?.days?.[key]?.learning?.[MODULE];
  const list = (value) => (Array.isArray(value) ? value.filter((c) => typeof c === 'string') : []);

  return {
    newChars: list(record?.newChars),
    reviewed: list(record?.reviewed),
  };
}

/**
 * 找识字对应的自律任务。按 `module` 找而不是按 id —— 与 `learning.js` 的
 * `habitOf` 同一条理由（那两个取值恰好相同，但那是 data/defaultHabits.js 的巧合）。
 *
 * @param {object} save 存档
 * @returns {object | null} 任务定义，没有时 `null`
 */
function habitOf(save) {
  const habits = Array.isArray(save?.habits) ? save.habits : [];
  return habits.find((item) => item.module === MODULE) ?? null;
}

/**
 * 把语料里的一条转成卡片：4 个字段加一个算出来的 `emoji`。
 *
 * `% 15` 落在这一层而不是 `data/`：线上那个 emoji 字段是下标的函数，
 * 搬进常量区等于存 2000 份可以算出来的东西（见 doc.md）。
 * 页面因此拿到的卡片上已经带着 emoji，不写那 15 个字符。
 *
 * @param {number} index 语料下标
 * @param {{ step: number, due: string, wrong: number } | undefined} record 进度记录
 * @returns {object} 卡片
 */
function cardAt(index, record) {
  const item = CHARACTERS[index];

  return {
    char: item.char,
    pinyin: item.pinyin,
    words: item.words,
    sentence: item.sentence,
    emoji: CHAR_EMOJI[index % CHAR_EMOJI.length],
    step: record?.step ?? 0,
    wrong: record?.wrong ?? 0,
  };
}

/**
 * 两个队列的取法，`literacyState` 与 `gradeChar` 共用一份 ——
 * 打卡改判要问「还有没有新字可学、到期的字复习完没有」，问的必须是同一套判据。
 *
 * @param {Record<string, object>} chars 进度表
 * @param {Set<string>} graded 当天已评过的字
 * @param {string} todayKey 今天的日期键
 * @param {number} quota 今天还能引入几个新字
 * @returns {{ newIndexes: number[], dueItems: { index: number, record: object }[] }}
 */
function queues(chars, graded, todayKey, quota) {
  const newIndexes = [];
  for (let i = 0; i < CHARACTERS.length && newIndexes.length < quota; i++) {
    const char = CHARACTERS[i].char;
    if (chars[char] !== undefined || graded.has(char)) continue;
    newIndexes.push(i);
  }

  // 到期 = due <= 今天（日期键是定长字符串，字典序即时间序；空串比任何键都小）
  const dueItems = Object.entries(chars)
    .filter(([char, record]) => {
      if (record.step >= MASTERED_STEP) return false; // 掌握是终态，不再进任何队列
      if (graded.has(char)) return false; // 当天已评过的字明天才回来
      if (!INDEX_OF.has(char)) return false; // 导入来的脏字：语料里没有，渲染不出卡片
      return record.due <= todayKey;
    })
    .map(([char, record]) => ({ index: INDEX_OF.get(char), record }))
    // 错得多的先出现（glossary 的「提高出现频次」），其余按语料顺序
    .sort((a, b) => b.record.wrong - a.record.wrong || a.index - b.index)
    .slice(0, REVIEW_LIMIT);

  return { newIndexes, dueItems };
}

/**
 * 识字页的唯一读取入口。**不抛错**（渲染路径宽容）：`habits` 里没有识字任务时
 * `done` 为 `false`，存档里档位是坏值时收敛。
 *
 * 两个队列都排除「当天已评过」的字 —— 答对的字下次到期在明天以后，
 * 答错的字 `due` 是今天，不排除的话它会在同一次会话里一直回到队列顶上（`LITERACY-14`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {{ newChars: object[], reviewChars: object[], todayNew: number, dailyNew: number,
 *             learned: number, mastered: number, total: number, done: boolean }}
 */
export function literacyState(save, key, now) {
  const chars = charsOf(save);
  const today = todayOf(save, key);
  const graded = new Set([...today.newChars, ...today.reviewed]);
  const todayKey = Number.isFinite(now) ? dayKeyAfter(now, 0) : key;
  const { newIndexes, dueItems } = queues(
    chars,
    graded,
    todayKey,
    DAILY_NEW - today.newChars.length,
  );

  const habit = habitOf(save);
  const checks = save?.days?.[key]?.checks;

  return {
    newChars: newIndexes.map((index) => cardAt(index, undefined)),
    reviewChars: dueItems.map((item) => cardAt(item.index, item.record)),
    todayNew: today.newChars.length,
    dailyNew: DAILY_NEW,
    learned: Object.keys(chars).length,
    mastered: Object.values(chars).filter((record) => record.step >= MASTERED_STEP).length,
    total: CHARACTERS.length,
    done: habit !== null && typeof checks === 'object' && checks !== null && habit.id in checks,
  };
}

/**
 * 给一个字评分：`known` 为 `true` 是「我认识」，`false` 是「还不太会」。
 *
 * **一个函数收两种评分**，不是 `knowChar` / `forgetChar` 两个：两条路径的差别只有
 * 「档位往前一档还是回到 0」，其余（当天去重、写记录、够数就打卡）完全相同 ——
 * 拆开就要把那三件事抄两遍（与 `toggleHealth` / `setHealth` 的分法同一条判断）。
 *
 * **当天重复评分原样返回**（对象同一性），线上没有这个防护，
 * 于是同一张卡片能重复推进调度、重复减错误数。
 *
 * **发放先行、记录后写**：`day` 从发放后的存档里取，`checks` / `ledger` / `learning`
 * 三个兄弟键就不可能互相覆盖（P6 的做法，比 `completeLearning` 的顺序更耐改）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} char 汉字
 * @param {boolean} known 认识与否
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；当天已评过这个字时返回入参本身
 * @throws {RangeError} 字不在字库里，或 `habits` 里没有识字任务
 * @throws {TypeError} `now` 非有限数
 */
export function gradeChar(save, key, char, known, now) {
  if (!INDEX_OF.has(char)) {
    throw new RangeError(`汉字 ${JSON.stringify(char)} 不在字库里`);
  }
  const habit = habitOf(save);
  if (habit === null) {
    throw new RangeError(`habits 里没有 module 为 ${JSON.stringify(MODULE)} 的任务`);
  }
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const today = todayOf(save, key);
  if (today.newChars.includes(char) || today.reviewed.includes(char)) return save;

  const chars = charsOf(save);
  const prev = chars[char];
  const isNew = prev === undefined;

  // 答对进一档，第 N 次答对之后等 REVIEW_STEPS[N-1] 天（第一次就是 +1 天）；
  // 走完 30 那一档就是已掌握，due 置空、永不再出现。
  // 答错回第 0 档，due 是今天 —— 明天第一个出现（今天由上面那条去重挡住）
  const step = known ? Math.min(MASTERED_STEP, (prev?.step ?? 0) + 1) : 0;
  const record = {
    step,
    due: step >= MASTERED_STEP ? '' : dayKeyAfter(now, step === 0 ? 0 : REVIEW_STEPS[step - 1]),
    wrong: (prev?.wrong ?? 0) + (known ? 0 : 1),
  };

  const scheduled = {
    ...save,
    learningProgress: {
      ...save.learningProgress,
      literacy: { ...save.learningProgress?.literacy, chars: { ...chars, [char]: record } },
    },
  };

  const next = {
    ...today,
    [isNew ? 'newChars' : 'reviewed']: [...(isNew ? today.newChars : today.reviewed), char],
  };

  // 打卡条件：当天新字满 2。语料全学过之后新字池是空的，`newChars` 永远到不了 2，
  // 那一天改判成「当天到期的字全部复习完」—— 一行分支挡住 2000 天后的永久死角。
  // 问队列用的是**这一次评分之后**的状态（graded 含刚评的字），与 literacyState 同一份判据
  const graded = new Set([...next.newChars, ...next.reviewed]);
  const after = queues(
    { ...chars, [char]: record },
    graded,
    dayKeyAfter(now, 0),
    DAILY_NEW - next.newChars.length,
  );
  const enough =
    next.newChars.length >= DAILY_NEW ||
    (after.newIndexes.length === 0 && after.dueItems.length === 0);

  const awarded = enough
    ? checkAwardAndGrow(scheduled, key, habit.id, now, EXP_PER_LITERACY)
    : scheduled;
  const day = awarded.days?.[key] ?? {};

  return {
    ...awarded,
    days: {
      ...awarded.days,
      [key]: { ...day, learning: { ...day.learning, [MODULE]: next } },
    },
  };
}
