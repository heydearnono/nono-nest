/**
 * 古诗：169 首的选诗、复习调度、国学打卡。
 *
 * 规格来源：docs/features/poem/doc.md（`POEM` 区）
 *
 * 依赖方向 poem.js → pet.js → point.js → habit.js → data/，与 literacy.js 同层。
 * **不 import reward.js**（结算由 pet.js 末尾的 settleDay 负责），
 * 反过来 reward.js 也不许 import 本文件 —— 会成环，所以 `mastered` 是存档字段。
 *
 * 与线上的三处偏离（理由都在 doc.md）：
 * 1. 本周三首**按未学顺序取并落盘**，不是 `floor(天序号/7)*3 % 109` 的滑动窗口 ——
 *    那个窗口硬前进，缺席一周那三首要等约 8 个月才回来，还会让启蒙阶段的孩子撞上《登高》。
 * 2. 间隔表**真的当间隔用**（四档跨 26 天、五次表态才算会背）。线上一次写六个到期日、
 *    判定是 some(d <= 今天)，而且那份调度用 `||=` 只在首次学习时写过一次，之后永不更新。
 * 3. 拓展 60 首**有一条走得通的路**（109 首必背全部会背后解锁）。线上是池子过滤加
 *    目录不可点两道墙，那 60 首永久不可达，页头「拓展 0/60」是个永远的 0。
 */

import { POEMS } from '../data/poems.js';
import { dayKeyAfter, weekKeys } from './dayKey.js';
import { checkAwardAndGrow } from './pet.js';

/** 复习间隔（天）。四档跨 26 天，是识字那六档的稀疏版 —— 古诗每周引入 3 首，压力小近五倍 */
const REVIEW_STEPS = [1, 3, 7, 15];

/**
 * 走完间隔表后的档位，表示已会背：不再进任何列表，`due` 置空、`mastered` 置真。
 *
 * `step` 是「连着说了几次已会背」而不是间隔表的下标（与识字同一套语义，
 * glossary 里 `step` 只有一条定义）—— 差一位是故意的：`step` 为 `1` 等
 * `REVIEW_STEPS[0]` 天，于是 `0` 空出来单独表示「上次说还没背下来，今天重来」。
 */
const MASTERED_STEP = REVIEW_STEPS.length + 1;

/** 每周引入几首，抄线上（界面也写「本周三首」） */
const WEEKLY_COUNT = 3;

/** 到期复习的上限，抄线上的 `slice(0, 2)` */
const REVIEW_LIMIT = 2;

/** 国学打卡产出的经验，与其余四个学习模块同价（`LEARN-08`） */
const EXP_PER_POEM = 8;

/** 本模块的子模块标识，用来在 `habits` 里找对应任务 */
const MODULE = 'guoxue';

/**
 * `grade` / `tier` 两个数据字段的中文标签。**落在这一层而不是 `data/`**：
 * 那是渲染用的映射，与 `literacyState` 给卡片算好 `emoji`、`healthState` 给
 * `poopIcons` 同一条分工 —— 页面拿到的卡片上已经带着 `gradeLabel` / `tierLabel`。
 */
const GRADE_LABELS = { 1: '启蒙', 2: '一年级', 3: '二年级+' };
const TIER_LABELS = { required: '必背', extended: '拓展' };

/** 诗 id → 数据包下标。169 条建一次，排序与「在不在诗库里」都要用它 */
const INDEX_OF = new Map(POEMS.map((item, i) => [item.id, i]));

/** 必背诗的条数（109）。池子切换与页头的分母都用它 */
const REQUIRED_TOTAL = POEMS.filter((item) => item.tier === 'required').length;

/**
 * 存档里的古诗进度表。缺失或坏结构时给空对象，读取方不必判空。
 *
 * 收敛已经由 `normalizeSave` 做过（`SAVE-17`），但存档也可能是调用方手拼的
 * （测试、家长端），所以读的时候仍然夹一次 —— 夹的代价是常数。
 *
 * `mastered` **不从存档里读**：它是 `step === MASTERED_STEP` 的冗余，
 * 两者矛盾时以 `step` 为准（`POEM-28`），所以这里只留三个字段。
 *
 * @param {object} save 存档
 * @returns {Record<string, { step: number, due: string, wrong: number }>}
 */
function poemsOf(save) {
  const raw = save?.learningProgress?.guoxue?.poems;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const out = {};
  for (const [id, record] of Object.entries(raw)) {
    if (typeof record !== 'object' || record === null) continue;
    out[id] = {
      step: clampStep(record.step),
      due: typeof record.due === 'string' ? record.due : '',
      wrong: clampWrong(record.wrong),
    };
  }
  return out;
}

/**
 * 档位夹到 `0` ~ `5` 的整数（**不是识字的 `7`**）。坏值当 `0`（从头熬）而不是抛错：
 * `poemState` 在渲染路径上（`AGENTS.md` 第 5 节第 6 条）。
 *
 * @param {unknown} value 原始档位
 * @returns {number}
 */
function clampStep(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MASTERED_STEP, Math.max(0, Math.round(value)));
}

/**
 * 说过几次「还没背下来」，夹成非负整数。
 *
 * @param {unknown} value 原始计数
 * @returns {number}
 */
function clampWrong(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * 落盘的本周水位。`weekKey` 与 `ids` 都可能缺失或是坏值，一律收敛。
 *
 * @param {object} save 存档
 * @returns {{ weekKey: string, ids: string[] }}
 */
function weeklyOf(save) {
  const raw = save?.learningProgress?.guoxue?.weekly;

  return {
    weekKey: typeof raw?.weekKey === 'string' ? raw.weekKey : '',
    ids: Array.isArray(raw?.ids) ? raw.ids.filter((id) => typeof id === 'string') : [],
  };
}

/**
 * 当天表过态的诗。**一个数组，不是线上那个单数的 `{ poemId, learned, recited }`** ——
 * 线上一天学两首，后一首覆盖前一首。
 *
 * 它有两个读取点：打卡判据与当天去重（`POEM-16` / `POEM-17`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {{ poems: string[] }}
 */
function todayOf(save, key) {
  const raw = save?.days?.[key]?.learning?.[MODULE]?.poems;

  return { poems: Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [] };
}

/**
 * 找国学对应的学习任务。按 `module` 找而不是按 id —— 与 `literacy.js` / `learning.js`
 * 同一条理由（那两个取值恰好相同，但那是 data/defaultHabits.js 的巧合）。
 *
 * @param {object} save 存档
 * @returns {object | null} 任务定义，没有时 `null`
 */
function habitOf(save) {
  const habits = Array.isArray(save?.habits) ? save.habits : [];
  return habits.find((item) => item.module === MODULE) ?? null;
}

/**
 * 必背 109 首全部会背了没有 —— 拓展诗解锁的唯一条件（`POEM-23` / `POEM-24`）。
 *
 * @param {Record<string, { step: number }>} poems 进度表
 * @returns {boolean}
 */
function requiredAllMastered(poems) {
  let mastered = 0;
  for (const item of POEMS) {
    if (item.tier !== 'required') continue;
    if (poems[item.id]?.step >= MASTERED_STEP) mastered += 1;
  }
  return mastered >= REQUIRED_TOTAL;
}

/**
 * 选本周三首：**从选诗池里按数据包顺序取最前面三首还没学过的**，
 * 与识字「取未学过的字里语料顺序最前的两个」逐字同构。
 *
 * `studyPoem` 落盘与 `poemState` 读到过期 `weekKey` 时当场重算，共用的就是这一个
 * 函数（`POEM-30`）—— 共用判据要共用的是函数，不是两处抄一样的规则。
 *
 * 池子默认是 109 首必背；必背全部会背之后变成全部 169 首。那条分支跑得到，
 * 只是最快也在一年以后（每周 3 首、109 首至少 36 周引入，加上每首 26 天）。
 *
 * @param {Record<string, object>} poems 进度表
 * @returns {string[]} 至多三个诗 id，按数据包顺序
 */
function pickWeekly(poems) {
  const open = requiredAllMastered(poems);
  const ids = [];

  for (const item of POEMS) {
    if (ids.length >= WEEKLY_COUNT) break;
    if (!open && item.tier !== 'required') continue;
    if (poems[item.id] !== undefined) continue;
    ids.push(item.id);
  }
  return ids;
}

/**
 * 把数据包里的一条转成卡片。`learned` / `dueToday` / `mastered` 三个布尔都在这一层算好 ——
 * 页面不写 `step === 5`，也不比日期字符串（`AGENTS.md` 第 3 节）。
 *
 * @param {number} index 数据包下标
 * @param {{ step: number, due: string, wrong: number } | undefined} record 进度记录
 * @param {boolean} dueToday 今天该复习
 * @returns {object} 卡片
 */
function cardAt(index, record, dueToday) {
  const item = POEMS[index];
  const step = record?.step ?? 0;

  return {
    id: item.id,
    title: item.title,
    author: item.author,
    dynasty: item.dynasty,
    content: item.content,
    grade: item.grade,
    tier: item.tier,
    gradeLabel: GRADE_LABELS[item.grade] ?? '',
    tierLabel: TIER_LABELS[item.tier] ?? '',
    step,
    mastered: step >= MASTERED_STEP,
    wrong: record?.wrong ?? 0,
    learned: record !== undefined,
    dueToday,
  };
}

/**
 * 一首诗今天该不该出现在复习列表里。
 *
 * @param {{ step: number, due: string }} record 进度记录
 * @param {string} todayKey 今天的日期键
 * @param {boolean} graded 今天表过态了没有
 * @returns {boolean}
 */
function isDue(record, todayKey, graded) {
  if (record.step >= MASTERED_STEP) return false; // 会背是终态，不再进任何列表
  if (graded) return false; // 当天表过态的明天才回来（POEM-17）
  // 到期 = due <= 今天（日期键是定长字符串，字典序即时间序；空串比任何键都小）
  return record.due <= todayKey;
}

/**
 * 国学页的唯一读取入口。**不抛错**（渲染路径宽容）：`habits` 里没有国学任务时
 * `done` 为 `false`、存档里档位是坏值时收敛、`poems` 里有不在诗库里的 id
 * （导入来的脏数据）时那条不进任何列表（`POEM-32`）。
 *
 * `now` 非有限数时**用落盘的 `weekly.ids`**、没有落盘就给空数组 ——
 * 不抛错，也不去猜「本周」是哪一周（`POEM-29`）。
 *
 * `weekly` 与 `reviews` **互不重叠**：本周三首里今天到期的那首留在 `weekly`
 * 并带 `dueToday`，不再出现在 `reviews` —— 同一张卡片在一屏里出现两次，
 * 孩子会以为是两首诗（`POEM-15`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {{ weekly: object[], reviews: object[],
 *             required: { learned: number, mastered: number, total: number },
 *             extended: { learned: number, mastered: number, total: number },
 *             extendedOpen: boolean, done: boolean }}
 */
export function poemState(save, key, now) {
  const poems = poemsOf(save);
  const graded = new Set(todayOf(save, key).poems);
  const stored = weeklyOf(save);
  const todayKey = Number.isFinite(now) ? dayKeyAfter(now, 0) : key;

  // 落盘的水位过期（或从没落过）时当场按同一个 helper 算一遍，不写存档 ——
  // 整周没学过诗的那些周因此从不落盘，而显示的与将来落盘的是同一个序列（POEM-30）
  const ids = Number.isFinite(now)
    ? stored.weekKey === weekKeys(now)[0]
      ? stored.ids
      : pickWeekly(poems)
    : stored.ids;

  const inWeekly = new Set(ids);
  const weekly = ids
    .filter((id) => INDEX_OF.has(id))
    // 会背了的从本周三首里退场（`POEM-10`）：一周内熬到会背要连着五天表态，
    // 罕见但走得到。学过而没会背的仍留着、标成已学（`POEM-04`）
    .filter((id) => (poems[id]?.step ?? 0) < MASTERED_STEP)
    .map((id) => {
      const record = poems[id];
      const due = record !== undefined && isDue(record, todayKey, graded.has(id));
      return cardAt(INDEX_OF.get(id), record, due);
    });

  const reviews = Object.entries(poems)
    .filter(([id, record]) => {
      if (inWeekly.has(id)) return false; // 本周三首已经在上面那一段里
      if (!INDEX_OF.has(id)) return false; // 导入来的脏 id：诗库里没有，渲染不出卡片
      return isDue(record, todayKey, graded.has(id));
    })
    .map(([id, record]) => ({ index: INDEX_OF.get(id), record }))
    // 说过「还没背下来」次数多的先出现，其余按数据包顺序
    .sort((a, b) => b.record.wrong - a.record.wrong || a.index - b.index)
    .slice(0, REVIEW_LIMIT)
    .map((item) => cardAt(item.index, item.record, true));

  const tally = (tier) => {
    let learned = 0;
    let mastered = 0;
    let total = 0;
    for (const item of POEMS) {
      if (item.tier !== tier) continue;
      total += 1;
      const record = poems[item.id];
      if (record === undefined) continue;
      learned += 1;
      if (record.step >= MASTERED_STEP) mastered += 1;
    }
    return { learned, mastered, total };
  };

  const habit = habitOf(save);
  const checks = save?.days?.[key]?.checks;

  return {
    weekly,
    reviews,
    required: tally('required'),
    extended: tally('extended'),
    extendedOpen: requiredAllMastered(poems),
    done: habit !== null && typeof checks === 'object' && checks !== null && habit.id in checks,
  };
}

/**
 * 对一首诗表态：`recited` 为 `true` 是「✨ 已会背」，`false` 是「😅 还没背下来」。
 *
 * **一个函数收两种表态**，不是 `recitePoem` / `forgetPoem` 两个：两条路径的差别只有
 * 「档位往前一档还是回到 0」，其余（刷水位、当天去重、写记录、打卡发放）完全相同
 * （与 `gradeChar` 收两种评分同一条判断）。
 *
 * **两种表态都打卡、都发放。** 这一格的定义是「每周 3 首」，一天表一次态就够了；
 * 诚实地说没背下来不该比谎报亏（`docs/vision.md`「什么算好」第 2 条）。
 *
 * **先刷水位再动手**：`weekKey` 与本周不符就重选本周三首。页面因此不必额外调一个
 * `refreshWeekly` —— 那就是「留给页面两步走」。
 *
 * **当天重复表态原样返回**（对象同一性）。这条同时挡住「还没背下来」的循环：
 * 那首诗 `due` 是今天，不拦的话它会在同一次会话里一直回到列表顶上。
 *
 * **发放先行、记录后写**：`day` 从发放后的存档里取，`checks` / `ledger` / `learning`
 * 三个兄弟键就不可能互相覆盖（`POEM-21`，与 `gradeChar` 同一条）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} poemId 诗 id
 * @param {boolean} recited 会背与否
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；当天已对这首诗表过态时返回入参本身
 * @throws {RangeError} 诗不在诗库里，或 `habits` 里没有国学任务
 * @throws {TypeError} `now` 非有限数
 */
export function studyPoem(save, key, poemId, recited, now) {
  if (!INDEX_OF.has(poemId)) {
    throw new RangeError(`诗 ${JSON.stringify(poemId)} 不在诗库里`);
  }
  const habit = habitOf(save);
  if (habit === null) {
    throw new RangeError(`habits 里没有 module 为 ${JSON.stringify(MODULE)} 的任务`);
  }
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const today = todayOf(save, key);
  if (today.poems.includes(poemId)) return save;

  const poems = poemsOf(save);
  const prev = poems[poemId];

  // 说已会背进一档，第 N 次之后等 REVIEW_STEPS[N-1] 天（第一次就是 +1 天）；
  // 走完 15 那一档（step 从 4 变 5）才算会背，due 置空、永不再出现。
  // 说还没背下来回第 0 档，due 是今天 —— 明天第一个出现（今天由上面那条去重挡住）
  const step = recited ? Math.min(MASTERED_STEP, (prev?.step ?? 0) + 1) : 0;
  const record = {
    step,
    due: step >= MASTERED_STEP ? '' : dayKeyAfter(now, step === 0 ? 0 : REVIEW_STEPS[step - 1]),
    wrong: (prev?.wrong ?? 0) + (recited ? 0 : 1),
    // 与 step === MASTERED_STEP 冗余，写它是因为 reward.js 的 poems_mastered 判据
    // 不能 import 本文件（会成环）—— 两个字段每次一起写，正常路径上不可能分叉
    mastered: step >= MASTERED_STEP,
  };

  // 水位用**这一次表态之前**的进度表选，与 poemState 重算时看到的是同一份（POEM-30）
  const stored = weeklyOf(save);
  const weekKey = weekKeys(now)[0];
  const weekly = stored.weekKey === weekKey ? stored : { weekKey, ids: pickWeekly(poems) };

  const scheduled = {
    ...save,
    learningProgress: {
      ...save.learningProgress,
      guoxue: {
        ...save.learningProgress?.guoxue,
        poems: { ...poems, [poemId]: record },
        weekly,
      },
    },
  };

  // 打卡条件是「当天表过任意一首的态」，不论说的是哪一句。
  // 第二首表态时 checkAwardAndGrow 靠 check 的幂等原样返回，不重复发放（POEM-20）
  const awarded = checkAwardAndGrow(scheduled, key, habit.id, now, EXP_PER_POEM);
  const day = awarded.days?.[key] ?? {};

  return {
    ...awarded,
    days: {
      ...awarded.days,
      [key]: {
        ...day,
        learning: { ...day.learning, [MODULE]: { poems: [...today.poems, poemId] } },
      },
    },
  };
}
