/**
 * 存档：默认值与补齐。
 *
 * 规格来源：docs/features/storage/doc.md（`SAVE` 区）
 *
 * `normalizeSave` **不抛错**。存档来自 storage，可能被手改、也可能被旧版本写坏；
 * 读失败就白屏，违反 docs/vision.md「什么算好」第 2 条（不清零、不惩罚），
 * 所以一律收敛到合法值。这与 utils/ 里其它纯函数对非法入参抛错的约定不同，
 * 是刻意的例外，理由写在 doc.md 里。
 *
 * `habits` 从 P7 第二段起收敛（在此之前是 `arr(raw.habits)` 整份透传）。
 * **改的时点是它第一次有了写入路径**（家长端的 `saveHabit` / `addHabit` / `moveHabit`），
 * 不是它的结构变清楚了 —— 结构从 P2 起就没变过。`days` 至今仍透传，
 * 因为它的内部结构由各 feature 定义，本层认不出好坏。
 *
 * `rewardFlags` 是 P7 第二段新增的顶层键，**缺键 = 启用**：一张没被明确停用的卡
 * 应该能换。所以读取侧一律判 `!== false` / `=== false`，**绝不判真值**
 * （utils/reward.js，REWARD-16 / REWARD-17）。
 *
 * `stickerCollection` 与 `lastFreeStickerDate` 是 `STICKER` 一轮新增的两个顶层键，
 * 也是**线上 19 个顶层键里最后两个被接进来的**。前者**键存在即拥有**：
 * 值只用来数「几次」，所以 `0` 是脏数据而不是「拥有 0 张」，收敛时整条丢掉 ——
 * 读取侧于是一律判「键在不在」，不需要第二个判据（SAVE-25）。
 * 后者是第四个 `dayKey` 水位，收敛逐字照 `lastWeeklyBonusWeek`（SAVE-26）。
 */

/** 饱腹度与开心度的取值范围（线上原样，0-5 离散档位） */
const PET_SCALE_MIN = 0;
const PET_SCALE_MAX = 5;

/**
 * 识字复习档位的上界。`step` 是连续答对的次数：`1` ~ `6` 各对应间隔表的一档，`7` 表示已掌握。
 * 档位对应几天、什么算掌握由 docs/features/literacy/doc.md 定，本层只夹范围。
 */
const STEP_MAX = 7;

/**
 * 古诗复习档位的上界。**与识字不是同一个数**：古诗的间隔表是四档（跨 26 天），
 * 识字是六档（跨 58 天）—— 两个模块每天的引入量差近五倍，档位疏密本来就不同
 * （docs/features/poem/doc.md）。本层因此有两个上界常量，不是一个。
 */
const POEM_STEP_MAX = 5;

/**
 * 数学的阶段数。**这不是第三个档位上界** —— 数学没有间隔表、没有 `step` / `due`，
 * 30 道固定题的「明天再见」由「优先出没答对过的」自然完成
 * （docs/features/math/doc.md）。这个 6 是六个阶段的编号上界。
 */
const MATH_STAGE_MAX = 6;

/**
 * PIN 连续输错次数的上界。**这是水位不是设置项** —— 它由 `utils/parent.js` 的
 * `verifyPin` 累加、验对清零，家长端没有输入框能改它。夹到 `5` 只是不让脏存档
 * 把数字撑大：它唯一的用途是跟 `PIN_MAX_FAILS` 比，存 `999` 与存 `5` 行为一样
 * （docs/features/parent/doc.md）。
 */
const PIN_MAX_FAILS = 5;

/**
 * 每日目标的上界。线上设置页夹 `1` ~ `12`，但那道夹子在页面里 —— 导入一份
 * `dailyGoal: 99` 的存档绕得过去，看板会永远显示「差 99 项」。上界落到本层之后
 * 那条路径消失（docs/features/parent/doc.md 缺陷 6）。
 */
const DAILY_GOAL_MAX = 12;

/** 到期日只认 `YYYY-MM-DD` 形状；空串是合法值，含义是「立刻到期」 */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 兑换记录的三个状态。坏值落 `'pending'` 而不是 `'done'`：
 * 坏数据宁愿留在待兑现列表里让家长看见，也不要悄悄变成「已经给过了」（SAVE-15）。
 *
 * `'cancelled'` 是 P7 第三段加的第三个取值（SAVE-24，家长驳回后落它）。
 * **坏值也不落 `'cancelled'`** —— 那个状态的语义是「退过款了」，
 * 把一条认不出状态的记录说成退过款，等于凭空承认一笔没发生的退款。
 */
const REDEMPTION_STATUS = ['pending', 'done', 'cancelled'];

/**
 * 自律任务的三个类别。坏值落 `'habit'`（第一个）：`habit` 类不需要 `module`，
 * 而落 `'learning'` 会让一条没有 `module` 的任务进学习入口页的查找路径。
 */
const HABIT_CATEGORIES = ['habit', 'learning', 'health'];

/**
 * 自律任务的两个频次。坏值落 `'daily'`（第一个）：`weekly` 要配 `weeklyTarget`，
 * 而那是个条件字段，坏值不该凭空造出一个「本周 N/undefined」。
 */
const HABIT_FREQUENCIES = ['daily', 'weekly'];

/**
 * 单次打卡产出的上界。**不是防溢出，是防通胀** —— 一次打卡 999 星光会让兑换
 * 那条链失去参照（docs/features/parent/doc.md）。下界 `0` 是合法值：
 * 产出落 0 就是「只记录不奖励」的一条任务。
 */
const HABIT_REWARD_MAX = 10;

/**
 * 收敛成 [min, max] 区间内的整数。非数值、NaN、Infinity 一律取 fallback。
 *
 * @param {unknown} value 待收敛的值
 * @param {number} min 下界（含）
 * @param {number} max 上界（含），无上界时传 Number.POSITIVE_INFINITY
 * @param {number} fallback 无法解释成数值时的取值
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 非空字符串，否则取 fallback。
 *
 * @param {unknown} value 待收敛的值
 * @param {string} fallback 默认值
 * @param {boolean} [allowEmpty] 是否允许空串（备注类字段允许）
 * @returns {string}
 */
function str(value, fallback, allowEmpty = false) {
  if (typeof value !== 'string') return fallback;
  if (!allowEmpty && value === '') return fallback;
  return value;
}

/**
 * 只在真的是数组时保留，否则给一个新的空数组。
 *
 * @param {unknown} value 待收敛的值
 * @returns {unknown[]}
 */
function arr(value) {
  return Array.isArray(value) ? value.slice() : [];
}

/**
 * 普通对象（排除 null 与数组）。
 *
 * @param {unknown} value 待判断的值
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 收敛识字的跨天进度：一个字一条记录，三个字段。
 *
 * 与 `days` 那样透传不同，这里要收敛 —— `days` 的内部结构由各 feature 定义、本层认不出
 * 好坏，而 `chars` 的三个字段就是两个数加一个日期键，收敛在这里做一次，
 * utils/literacy.js 的读取路径就不必每处再夹一遍（SAVE-13）。
 *
 * @param {unknown} raw 原始的 `learningProgress.literacy` 值
 * @returns {object} `{ chars: { [char]: { step, due, wrong } } }`
 */
function literacyProgress(raw) {
  const source = isPlainObject(raw) && isPlainObject(raw.chars) ? raw.chars : {};
  const chars = {};

  for (const [char, record] of Object.entries(source)) {
    const r = isPlainObject(record) ? record : {};
    const due = typeof r.due === 'string' && DAY_KEY_RE.test(r.due) ? r.due : '';
    chars[char] = {
      step: clampInt(r.step, 0, STEP_MAX, 0),
      due,
      wrong: clampInt(r.wrong, 0, Number.POSITIVE_INFINITY, 0),
    };
  }

  return { chars };
}

/**
 * 收敛古诗的跨天进度：一首诗一条记录，加一个「本周三首」的水位。
 *
 * 与 `chars` 的差别有两处，都写在 doc.md 里：`step` 的上界是 `5` 不是 `7`，
 * 且多一个 `mastered` 布尔。`mastered` 与 `step === POEM_STEP_MAX` 说的是同一件事，
 * 是**刻意的冗余** —— `ACHV` 区的 `poems_mastered` 判据在 utils/reward.js 里，
 * 而 reward.js 不能 import poem.js（会成环），所以「会背了没有」必须是存档上
 * 直接读得出的事实。本层照 `step` 现算它而不是原样收下：两个字段矛盾时以 `step` 为准，
 * 仲裁规则只有一条（SAVE-17）。
 *
 * `weekly` 是**水位**（这一周锁定了哪三首），不是可以重算的快照。本层
 * **不校验 `ids` 里的 id 在不在诗库里** —— 那要 import data/poems.js，
 * 而本文件至今不 import 任何 data/。脏 id 由 poemState 在渲染时挑掉（POEM-32）。
 *
 * @param {unknown} raw 原始的 `learningProgress.guoxue` 值
 * @returns {object} `{ poems: { [id]: { step, due, wrong, mastered } }, weekly: { weekKey, ids } }`
 */
function guoxueProgress(raw) {
  const source = isPlainObject(raw) && isPlainObject(raw.poems) ? raw.poems : {};
  const poems = {};

  for (const [id, record] of Object.entries(source)) {
    const r = isPlainObject(record) ? record : {};
    const step = clampInt(r.step, 0, POEM_STEP_MAX, 0);
    poems[id] = {
      step,
      due: typeof r.due === 'string' && DAY_KEY_RE.test(r.due) ? r.due : '',
      wrong: clampInt(r.wrong, 0, Number.POSITIVE_INFINITY, 0),
      mastered: step === POEM_STEP_MAX,
    };
  }

  const rawWeekly = isPlainObject(raw) && isPlainObject(raw.weekly) ? raw.weekly : {};

  return {
    poems,
    weekly: {
      weekKey:
        typeof rawWeekly.weekKey === 'string' && DAY_KEY_RE.test(rawWeekly.weekKey)
          ? rawWeekly.weekKey
          : '',
      ids: arr(rawWeekly.ids).filter((id) => typeof id === 'string'),
    },
  };
}

/**
 * 收敛数学的跨天进度：一道题一条记录（两个字段），加一个「当前阶段」的水位。
 *
 * **与 `chars` / `poems` 不同构**：没有 `step` / `due` —— 数学不做复习调度
 * （docs/features/math/doc.md）。所以本文件有两个档位上界常量而不是三个。
 *
 * `correct` 是「答对过没有」，**终态**：答对之后再答错也不退回，那条规则在
 * utils/math.js 里；本层只保证它是布尔。`wrong` 是答错次数，非负整数。
 *
 * `stage` 是**水位**（这一刻实际在第几阶段），与 `guoxue.weekly`、
 * `lastWeeklyBonusWeek` 同一类：它推得出来（本阶段 5 道全对就该进下一阶段），
 * 但落盘的是「实际在第几阶段」—— 升阶要弹一句话，那句话不能每次读取都弹一遍。
 * 与 `rounds` 矛盾时**以 `stage` 为准**（MATH-32），仲裁规则只有一条。
 *
 * **本层不校验 `rounds` 里的 id 在不在题库里** —— 那要 import data/mathRounds.js，
 * 而本文件至今不 import 任何 data/。脏 id 由 mathState 在渲染时挑掉（MATH-33）。
 *
 * @param {unknown} raw 原始的 `learningProgress.math` 值
 * @returns {object} `{ rounds: { [id]: { correct, wrong } }, stage: number }`
 */
function mathProgress(raw) {
  const source = isPlainObject(raw) && isPlainObject(raw.rounds) ? raw.rounds : {};
  const rounds = {};

  for (const [id, record] of Object.entries(source)) {
    if (!isPlainObject(record)) continue; // 非对象的记录整条丢掉（SAVE-18）
    rounds[id] = {
      correct: record.correct === true,
      wrong: clampInt(record.wrong, 0, Number.POSITIVE_INFINITY, 0),
    };
  }

  return {
    rounds,
    stage: clampInt(isPlainObject(raw) ? raw.stage : undefined, 1, MATH_STAGE_MAX, 1),
  };
}

/**
 * 收敛兑换记录：非对象的元素整条丢掉，未知字段丢弃。
 *
 * `name` / `icon` / `medalCost` 是**快照**（线上同样）：家长将来改了奖励的名字或价格，
 * 历史记录仍显示当时兑的是什么、花了多少。所以本层不去 data/rewards.js 回查这三个值。
 *
 * 收敛的理由与 `chars` 同一条：元素字段就是几个数和几个字符串，本层认得出好坏，
 * 收敛一次让 utils/reward.js 的读取路径不必每处再夹一遍（SAVE-15）。
 *
 * @param {unknown} value 原始的 `redemptions` 值
 * @returns {object[]} 兑换记录，最新在前（顺序原样保留）
 */
function redemptions(value) {
  const noMax = Number.POSITIVE_INFINITY;

  return arr(value)
    .filter(isPlainObject)
    .map((item) => ({
      at: clampInt(item.at, 0, noMax, 0),
      rewardId: str(item.rewardId, '', true),
      name: str(item.name, '', true),
      icon: str(item.icon, '', true),
      medalCost: clampInt(item.medalCost, 0, noMax, 0),
      status: REDEMPTION_STATUS.includes(item.status) ? item.status : REDEMPTION_STATUS[0],
    }));
}

/**
 * 收敛自律任务：一条任务一个元素，十一个字段加两个条件字段。
 *
 * 与 `redemptions` 有三处不同，都在 doc.md 里（`SAVE-20` ~ `SAVE-22`）：
 *
 * 1. **`id` 坏就整条丢掉**（`redemptions` 只把坏 `rewardId` 落空串）。没有 id 的任务
 *    打不了卡（`days[key].checks` 按 id 存）、也改不了（`saveHabit` 按 id 找），
 *    留着只是让首页多一个点不动的格子。**重复 id 只留第一条** ——
 *    两条同 id 会共享同一个打卡状态，界面上是「点一个亮两个」。
 * 2. **`module` / `weeklyTarget` 条件保留**：只在 `learning` / `weekly` 时存在，
 *    缺席就让它缺席。无条件补默认值会让 18 条里 13 条多一个 `module: ''`，
 *    而 `learning.js::habitOf` 用 `find(item => item.module === module)` 找任务。
 * 3. **`enabled` 的坏值落 `true`**：与 `status` 落 `'pending'` 是同一种考量的相反方向。
 *    不明不白地少一个打卡项比多一个更难发现 —— 首页少一格没人会注意，
 *    但进度分母跟着变，`dayProgress` 显示的「今天 5/8」是错的却看不出错。
 *
 * 本层**只管形状不管名单**：哪几条是 `core`、哪些字段家长能改、`sortOrder` 怎么重排，
 * 在 docs/features/habit/doc.md 与 docs/features/parent/doc.md。
 *
 * @param {unknown} value 原始的 `habits` 值
 * @returns {object[]} 自律任务，顺序原样保留（显示次序看 `sortOrder`，不看数组下标）
 */
function habits(value) {
  const seen = new Set();
  const list = [];

  for (const item of arr(value)) {
    if (!isPlainObject(item)) continue;
    if (typeof item.id !== 'string' || item.id === '') continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const category = HABIT_CATEGORIES.includes(item.category) ? item.category : HABIT_CATEGORIES[0];
    const frequency = HABIT_FREQUENCIES.includes(item.frequency)
      ? item.frequency
      : HABIT_FREQUENCIES[0];

    // 全空白也落 `'未命名'`：一个空白名字在首页与家长端都是一格看不见的按钮
    const name = str(item.name, '未命名');

    const entry = {
      id: item.id,
      name: name.trim() === '' ? '未命名' : name,
      icon: str(item.icon, '⭐'),
      category,
      frequency,
      starReward: clampInt(item.starReward, 0, HABIT_REWARD_MAX, 1),
      petFoodReward: clampInt(item.petFoodReward, 0, HABIT_REWARD_MAX, 1),
      needsParentConfirm: item.needsParentConfirm === true,
      enabled: item.enabled !== false,
      sortOrder: clampInt(item.sortOrder, 0, Number.POSITIVE_INFINITY, 0),
      core: item.core === true,
    };

    // 两个条件字段：**坏值也缺席**（不补空串、不补 0）。`module` 落空串会让
    // `habitOf` 的 `find(item => item.module === module)` 在有人传空串时误匹配；
    // `weeklyTarget` 落 0 会让洗澡卡显示「本周 3/0」
    if (category === 'learning' && typeof item.module === 'string' && item.module !== '') {
      entry.module = item.module;
    }
    if (frequency === 'weekly') {
      const target = clampInt(item.weeklyTarget, 1, Number.POSITIVE_INFINITY, 0);
      if (target >= 1) entry.weeklyTarget = target;
    }

    list.push(entry);
  }

  return list;
}

/**
 * 收敛兑换卡的启用开关：`rewardId` → 布尔。
 *
 * **缺键 = 启用**，所以本层不补任何键 —— 默认就是空对象。值收敛成布尔
 * （`0` → `false`、`'x'` → `true`），非对象整份落空对象（`SAVE-23`）。
 *
 * **未知 id 原样留着**：本层零 import，认不出哪个 id 在 data/rewards.js 里登记过。
 * 留着不删与 `days` 的透传同一条 —— 本层不认得的键不删（删了就丢数据），
 * 只是没人读；忽略未知 id 的是 utils/reward.js 的读取路径（`REWARD-16`）。
 *
 * @param {unknown} value 原始的 `rewardFlags` 值
 * @returns {Record<string, boolean>} 开关表
 */
function rewardFlags(value) {
  if (!isPlainObject(value)) return {};

  const flags = {};
  for (const [id, flag] of Object.entries(value)) {
    flags[id] = Boolean(flag);
  }
  return flags;
}

/**
 * 收敛贴纸收藏册：`stickerId` → 抽到过几次。
 *
 * **键存在即拥有**，值只用来数「几次」—— 所以 `0` 不是「拥有 0 张」而是脏数据，
 * 整条丢掉（与 days[].checks 的墓碑同一条：`completed !== true` 不写键）。
 * 线上页面用 `Object.keys(e).filter(t => e[t] > 0)` 数收藏数
 * （.scratch/index-VUOSJfWA.js:677950），说明线上自己也承认收藏册里会有 `0`；
 * 本层把 `0` 丢掉之后，读取侧一律判「键在不在」，不需要第二个判据（`SAVE-25`）。
 *
 * **未知 id 原样留着**：本层零 import，认不出哪个 id 在 data/stickers.js 里登记过。
 * 与 rewardFlags 逐字同一条 —— 删了就丢数据，留着只是没人读；
 * 忽略未知 id 的是 utils/sticker.js 的读取路径（`STICKER-06`）。
 *
 * @param {unknown} value 原始的 `stickerCollection` 值
 * @returns {Record<string, number>} 贴纸 id → 抽到过几次（每个值都 >= 1）
 */
function stickerCollection(value) {
  if (!isPlainObject(value)) return {};

  const owned = {};
  for (const [id, count] of Object.entries(value)) {
    const times = Math.trunc(Number(count));
    if (Number.isFinite(times) && times >= 1) owned[id] = times;
  }
  return owned;
}

/**
 * 收敛成就 id：只留字符串并去重。
 *
 * 它是 `includes` 判断「解锁过没有」的依据，重复项会让奖励中心的已解锁计数虚高（SAVE-16）。
 *
 * @param {unknown} value 原始的 `achievements` 值
 * @returns {string[]} 成就 id
 */
function achievements(value) {
  return [...new Set(arr(value).filter((id) => typeof id === 'string'))];
}

/**
 * 存档的默认值。每次调用返回**新对象**，调用方可以随意改而不污染其它调用方。
 *
 * @returns {object} 一份全新的默认存档
 */
export function defaultSave() {
  return {
    version: 1,
    childName: 'nono',
    childAvatar: '👧',
    currency: { star: 0, gem: 0, petFood: 0, medal: 0 },
    pet: {
      type: 'unicorn',
      name: '彩虹',
      petLevel: 1,
      petExp: 0,
      fullness: 3,
      mood: 4,
      // 饱腹度衰减的基准时刻。0 = 还没有基准，首次结算时立成当前时刻，
      // 否则 now - 0 是个巨大的差值，一进来就看到饿瘪的宠物（FULLNESS-01）
      lastFedAt: 0,
    },
    habits: [],
    days: {},
    redemptions: [],
    achievements: [],
    // 兑换卡的启用开关（rewardId -> 布尔）。**空对象 = 三条全启用**：
    // 缺键当启用，所以这里不预先写三个 true —— 写了就得跟着 data/rewards.js 改（SAVE-23）
    rewardFlags: {},
    // 贴纸收藏册（stickerId -> 抽到过几次）。**键存在即拥有**，值只数次数 ——
    // 所以空对象就是「一张都没抽到」，不需要预写 140 个 0（SAVE-25）
    stickerCollection: {},
    // 上次用掉免费抽的 dayKey。空串 = 从未免费抽过：`'' !== 今天` 天然成立，
    // 第一次不需要特判（与 lastWeeklyBonusWeek 同一条，SAVE-26）
    lastFreeStickerDate: '',
    // 上次发过周奖励的周键（weekKeys(now)[0]，即本周周一的 dayKey）。
    // 空串 = 从未发过：`'' !== 本周周键` 天然成立，第一周不需要特判（SAVE-14）
    lastWeeklyBonusWeek: '',
    // 跨天的学习进度。识字落 chars（字 -> { step, due, wrong }），
    // 古诗落 poems（诗 id -> { step, due, wrong, mastered }）与 weekly 水位，
    // 数学落 rounds（题 id -> { correct, wrong }）与 stage 水位。
    // 三个子键之后这个顶层键就满了：阅读与英语在线上是死字段，不搬
    learningProgress: {
      literacy: { chars: {} },
      guoxue: { poems: {}, weekly: { weekKey: '', ids: [] } },
      math: { rounds: {}, stage: 1 },
    },
    // 三个设置项（pin / dailyGoal / note，线上 parentSettings 原样映射）
    // 加两个 PIN 节流水位（pinFails / pinLockedUntil，线上没有，导入落默认值）
    parent: { pin: '1234', dailyGoal: 6, note: '', pinFails: 0, pinLockedUntil: 0 },
    soundEnabled: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * 把任意输入补齐成一份合法存档：缺字段取默认值，越界值收敛，未知顶层字段丢弃。
 *
 * @param {unknown} raw storage 里读到的原始值，可能是 undefined / 脏数据
 * @returns {object} 合法存档
 */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!isPlainObject(raw)) return base;

  const rawCurrency = isPlainObject(raw.currency) ? raw.currency : {};
  const rawPet = isPlainObject(raw.pet) ? raw.pet : {};
  const rawParent = isPlainObject(raw.parent) ? raw.parent : {};
  const noMax = Number.POSITIVE_INFINITY;

  return {
    version: 1,
    childName: str(raw.childName, base.childName),
    childAvatar: str(raw.childAvatar, base.childAvatar),
    currency: {
      star: clampInt(rawCurrency.star, 0, noMax, base.currency.star),
      gem: clampInt(rawCurrency.gem, 0, noMax, base.currency.gem),
      petFood: clampInt(rawCurrency.petFood, 0, noMax, base.currency.petFood),
      medal: clampInt(rawCurrency.medal, 0, noMax, base.currency.medal),
    },
    pet: {
      type: str(rawPet.type, base.pet.type),
      name: str(rawPet.name, base.pet.name),
      petLevel: clampInt(rawPet.petLevel, 1, noMax, base.pet.petLevel),
      petExp: clampInt(rawPet.petExp, 0, noMax, base.pet.petExp),
      fullness: clampInt(rawPet.fullness, PET_SCALE_MIN, PET_SCALE_MAX, base.pet.fullness),
      mood: clampInt(rawPet.mood, PET_SCALE_MIN, PET_SCALE_MAX, base.pet.mood),
      lastFedAt: clampInt(rawPet.lastFedAt, 0, noMax, base.pet.lastFedAt),
    },
    habits: habits(raw.habits),
    // days 的内部结构由各 feature 自己定义，本层只保证原样存、原样取
    days: isPlainObject(raw.days) ? { ...raw.days } : {},
    redemptions: redemptions(raw.redemptions),
    achievements: achievements(raw.achievements),
    rewardFlags: rewardFlags(raw.rewardFlags),
    stickerCollection: stickerCollection(raw.stickerCollection),
    // 只认日期键形状，其余落空串 —— 逐字照 lastWeeklyBonusWeek。落空串的后果是
    // 「今天可能再免费抽一次」，落一个乱码的后果是「'乱码' !== 今天 恒成立，
    // 每天都能抽而且永远抽不完」。两个方向的错都指向多给一次，所以这里更安全（SAVE-26）
    lastFreeStickerDate:
      typeof raw.lastFreeStickerDate === 'string' && DAY_KEY_RE.test(raw.lastFreeStickerDate)
        ? raw.lastFreeStickerDate
        : '',
    // 只认日期键形状，其余落空串。落空串的后果是「这周可能再发一次周奖励」，
    // 而落一个乱码的后果是「永远发不出去」—— 宁愿多发一次也不要让奖励卡死（SAVE-14）
    lastWeeklyBonusWeek:
      typeof raw.lastWeeklyBonusWeek === 'string' && DAY_KEY_RE.test(raw.lastWeeklyBonusWeek)
        ? raw.lastWeeklyBonusWeek
        : '',
    learningProgress: {
      literacy: literacyProgress(
        isPlainObject(raw.learningProgress) ? raw.learningProgress.literacy : undefined,
      ),
      guoxue: guoxueProgress(
        isPlainObject(raw.learningProgress) ? raw.learningProgress.guoxue : undefined,
      ),
      math: mathProgress(
        isPlainObject(raw.learningProgress) ? raw.learningProgress.math : undefined,
      ),
    },
    parent: {
      pin: str(rawParent.pin, base.parent.pin),
      dailyGoal: clampInt(rawParent.dailyGoal, 1, DAILY_GOAL_MAX, base.parent.dailyGoal),
      note: str(rawParent.note, base.parent.note, true),
      pinFails: clampInt(rawParent.pinFails, 0, PIN_MAX_FAILS, base.parent.pinFails),
      pinLockedUntil: clampInt(rawParent.pinLockedUntil, 0, noMax, base.parent.pinLockedUntil),
    },
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : base.soundEnabled,
    createdAt: clampInt(raw.createdAt, 0, noMax, base.createdAt),
    updatedAt: clampInt(raw.updatedAt, 0, noMax, base.updatedAt),
  };
}
