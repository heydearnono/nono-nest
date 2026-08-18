/**
 * 线上工作台 JSON 的一次性导入。
 *
 * 规格来源：docs/features/storage/doc.md（`IMPORT` 区）
 *
 * 与 `normalizeSave` 的错误策略**相反**：导入非法输入要抛错。
 * 用户是主动粘贴 JSON 的，静默用默认值会让他以为导入成功了、实际清零 ——
 * 那正是数据迁移要避免的事故（见 docs/vision.md「数据迁移」）。
 *
 * 本仓库新加的字段一律**不接**，落 `normalizeSave` 的默认值：
 * `pet.lastFedAt`（线上没有喂食冷却）、`parent.pinFails` / `parent.pinLockedUntil`
 * （线上 PIN 输错无限次、没有节流，见 docs/features/parent/doc.md）、
 * `habits[].core`（线上没有「今日全勤名单」这个概念，落 `false`，见 `IMPORT-17`）。
 * 同一条规律的四处执行 —— 线上没有的概念，导入时不猜。
 *
 * `rewardFlags` **整份不接**（`IMPORT-18`）：线上 `rewardRules` 里三条卡默认全
 * `enabled: true`，映射过来恒等于「缺键 = 启用」那个默认值。
 * **不接一个没有信息量的映射** —— 与上面三条的理由不同：那三个是线上没有数据，
 * 这一个是线上有数据但搬过来一条信息都不增加。
 *
 * `stickerCollection` / `lastFreeStickerDate` 是**最后两个被接进来的线上顶层键**
 * （`IMPORT-22`，`STICKER` 一轮）。两个都是**同名恒等映射** —— 本仓库的贴纸 id
 * 是照抄线上由下标算出来的那一批（`st-000-小狗狗`），`dayKey` 与线上 `sr()` 同形。
 * **但恒等映射不等于整份透传**：元素收敛在 `normalizeSave` 里做（`SAVE-25`），
 * 所以一份带 `0` 值、带小数、带脏 id 的线上收藏册进来会被收拾干净。
 * 这一轮之后本文件没有「以后再说」的键了。
 */

import { defaultSave, normalizeSave } from './save.js';

/**
 * 线上字段 → 本仓库字段的映射表，逐行对应 doc.md 的映射表。
 * 只列**改名**的字段；同名字段（`version` / `soundEnabled` 等）不进表。
 */
const CURRENCY_MAP = {
  stars: 'star',
  gems: 'gem',
  foodPoints: 'petFood',
  medals: 'medal',
};

const PET_MAP = {
  type: 'type',
  name: 'name',
  level: 'petLevel',
  exp: 'petExp',
  satiety: 'fullness',
  happiness: 'mood',
  // unlockedDecor 是线上死字段，刻意不列 —— 不迁移
};

const PARENT_MAP = {
  pin: 'pin',
  dailyGoal: 'dailyGoal',
  note: 'note',
  // pinFails / pinLockedUntil 刻意不列 —— 线上没有节流，导入落默认值 0 / 0
};

/**
 * @param {unknown} value 待判断的值
 * @returns {boolean} 是否为普通对象（排除 null 与数组）
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 按映射表挑字段改名，源里没有的键不写进结果（留给 normalizeSave 补默认值）。
 *
 * @param {unknown} source 线上侧的子对象
 * @param {Record<string, string>} map 线上键 → 本仓库键
 * @returns {object} 改名后的对象
 */
function rename(source, map) {
  if (!isPlainObject(source)) return {};

  const out = {};
  for (const [from, to] of Object.entries(map)) {
    if (source[from] !== undefined) out[to] = source[from];
  }
  return out;
}

/**
 * 近似恒等映射：整份带过去，只挖掉列出的那几个键。
 *
 * 与 `rename` 是相反的写法，用在「线上字段绝大多数照搬、只有一两个刻意不接」的地方
 * （`learning.reading` / `learning.english`）。**白名单会漏掉线上后来新加的字段，
 * 黑名单不会** —— 这两处的字段是家长填的记录，多带一个不认识的字段没有害处
 * （`normalizeSave` 对 `days` 整体透传，读函数各自挑自己要的），
 * 而少带一个就是丢了家长写的东西。
 *
 * @param {object} source 源对象
 * @param {string[]} keys 要挖掉的键
 * @returns {object} 新对象
 */
function omit(source, keys) {
  const out = {};
  for (const [key, item] of Object.entries(source)) {
    if (!keys.includes(key)) out[key] = item;
  }
  return out;
}

/**
 * 线上的时间戳是 ISO 字符串，本仓库存毫秒数。
 *
 * @param {unknown} value ISO 字符串或毫秒数
 * @param {number} fallback 无法解析时的取值
 * @returns {number} 毫秒时间戳
 */
function toMs(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * 线上识字的五个平行结构 → 本仓库的一张表（IMPORT-11）。
 *
 * 线上是 `learnedChars` / `reviewChars` / `masteredChars` 三个列表加
 * `charReviewSchedule`（一个字六个到期日）与 `charWrongCounts`，本仓库是
 * 一个字一条 `{ step, due, wrong }`。档位推不出来的按「学过、立刻到期」算。
 *
 * **线上的已掌握直接认，不打回重学**：全退回 `step: 0` 会让「已掌握」从几百掉回 0，
 * 违反 docs/vision.md「什么算好」第 2 条。取舍写在 features/literacy/doc.md 里。
 *
 * `due` 用空串表示「立刻到期」而不是导入当天 —— 本函数不收 `now`（IMPORT 区既有签名），
 * 而到期判定是 `due <= 今天` 的字符串比较，空串小于任何日期键。
 *
 * @param {unknown} source 线上的 `learningProgress.literacy`
 * @returns {object} `{ chars }`，交给 normalizeSave 收敛
 */
function literacyFromOnline(source) {
  if (!isPlainObject(source)) return { chars: {} };

  const list = (value) => (Array.isArray(value) ? value : []);
  const schedule = isPlainObject(source.charReviewSchedule) ? source.charReviewSchedule : {};
  const wrongCounts = isPlainObject(source.charWrongCounts) ? source.charWrongCounts : {};
  const mastered = new Set(list(source.masteredChars));

  const chars = {};
  const put = (char, record) => {
    if (typeof char !== 'string' || char === '') return;
    if (chars[char] !== undefined) return; // 先写的优先：mastered 排在前面
    chars[char] = record;
  };

  for (const char of mastered) put(char, { step: 7, due: '' });

  for (const [char, dates] of Object.entries(schedule)) {
    // 线上一次评分写六个日期，到期判定是 some(d <= today) —— 最早那个才说话
    const earliest = list(dates)
      .filter((d) => typeof d === 'string')
      .sort()[0];
    put(char, { step: 0, due: earliest ?? '' });
  }

  for (const char of [...list(source.reviewChars), ...list(source.learnedChars)]) {
    put(char, { step: 0, due: '' });
  }

  for (const [char, record] of Object.entries(chars)) {
    record.wrong = wrongCounts[char];
  }

  return { chars };
}

/**
 * 线上古诗的三个平行结构 → 本仓库的一张表（IMPORT-14）。
 *
 * 线上是 `learnedPoems` / `masteredPoems` 两个列表加 `reviewSchedule`
 * （一首诗六个到期日），本仓库是一首诗一条 `{ step, due, wrong, mastered }`。
 *
 * **`wrong` 恒 `0`**：线上古诗没有错误计数 —— 它连「还没背下来」这个入口都没有。
 * 这不是丢数据，是线上确实没有这笔数据。
 *
 * **线上的已会背直接认，不打回重熬** —— 与识字的 `masteredChars` 同一条取舍
 * （理由见 features/literacy/doc.md：全退回会让数字掉回 0，违反「什么算好」第 2 条）。
 * 只是那批诗的「会背」是线上那套「点一下就算」给的，本仓库认下这笔历史账。
 *
 * `weekly` 不在这里出现：线上的本周三首是每次现算的（`floor(天序号/7)*3 % 109`），
 * 没有字段可搬，交给 normalizeSave 落空水位。
 *
 * @param {unknown} source 线上的 `learningProgress.guoxue`
 * @returns {object} `{ poems }`，交给 normalizeSave 收敛
 */
function guoxueFromOnline(source) {
  if (!isPlainObject(source)) return { poems: {} };

  const list = (value) => (Array.isArray(value) ? value : []);
  const schedule = isPlainObject(source.reviewSchedule) ? source.reviewSchedule : {};

  const poems = {};
  const put = (id, record) => {
    if (typeof id !== 'string' || id === '') return;
    if (poems[id] !== undefined) return; // 先写的优先：mastered 排在前面
    poems[id] = record;
  };

  // step 5 是古诗的顶档（四档间隔），mastered 由 normalizeSave 照 step 现算
  for (const id of list(source.masteredPoems)) put(id, { step: 5, due: '' });

  for (const [id, dates] of Object.entries(schedule)) {
    // 线上一次写六个日期，到期判定是 some(d <= today) —— 最早那个才说话
    const earliest = list(dates)
      .filter((d) => typeof d === 'string')
      .sort()[0];
    put(id, { step: 0, due: earliest ?? '' });
  }

  for (const id of list(source.learnedPoems)) put(id, { step: 0, due: '' });

  return { poems };
}

/**
 * 线上数学的四个字段 → 本仓库的两个（IMPORT-15）。
 *
 * **只接一个**：`currentStage` → `stage`。另外三个（`gamesCompleted` /
 * `stagePlayed` / `stageCorrect`）数的是**答了几次**，而本仓库数的是
 * **答对过哪些题**（docs/features/math/doc.md）—— 次数换不出题目，
 * 所以 `rounds` 落空对象。线上确实没有「答对过哪些题」这笔数据。
 *
 * 这是丢得最多的一条映射，而且是刻意的。代价是导入后「答对过的题」从零开始，
 * 但 `stage` 认下来了：孩子不会被打回第一阶段（vision「什么算好」第 2 条）。
 * 顺带一提线上那三个次数字段本身就是可以无限刷的（每答一题就 +1、无去重），
 * 搬过来只会把刷出来的数字一起搬过来。
 *
 * @param {unknown} source 线上的 `learningProgress.math`
 * @returns {object} `{ rounds, stage }`，交给 normalizeSave 收敛
 */
function mathFromOnline(source) {
  if (!isPlainObject(source)) return { rounds: {}, stage: 1 };

  // 夹范围由 normalizeSave 做（1 ~ 6），本处只改名
  return { rounds: {}, stage: source.currentStage };
}

/**
 * 线上兑换记录 → 本仓库的 `redemptions`（IMPORT-12）。
 *
 * 线上元素是 `{ id, rewardId, rewardName, medalCost, status, requestedAt, resolvedAt }`：
 * `id` 只当 React 列表 key（与流水同一条理由，不迁移）、`resolvedAt` 本仓库没有对应字段、
 * 线上**没有 `icon`**（兑换记录页从 `rewardRules` 回查图标），所以 `icon` 落空串 ——
 * 快照缺一个图标只是少显示一个 emoji，而回查会让导入依赖 data/rewards.js 的三条常量。
 *
 * 状态三值映射成三值：`approved` → `'done'`、`pending` 保持、
 * **`rejected` 落 `'cancelled'`**（P7 第三段给 `redemptions.status` 加了这个取值，
 * 在此之前整条丢掉）。**但导入不退款，也无款可退** —— 线上是批准时才扣勋章，
 * 那些被驳回的记录从来没被扣过；本仓库是申请即扣，所以只有本仓库自己驳回的那些
 * 才走 `postLedger` 退回（docs/features/parent/doc.md `PARENT-73`）。
 * 同一个 `'cancelled'` 两种来历，这也是它的文案叫「已取消」不叫「已退回」的原因。
 *
 * @param {unknown} value 线上的 `exchangeRecords`
 * @returns {object[]} 交给 normalizeSave 收敛
 */
function redemptionsFromOnline(value) {
  if (!Array.isArray(value)) return [];

  const STATUS = { approved: 'done', rejected: 'cancelled', pending: 'pending' };

  return value.filter(isPlainObject).map((item) => ({
    at: toMs(item.requestedAt, 0),
    rewardId: item.rewardId,
    name: item.rewardName,
    icon: '',
    medalCost: item.medalCost,
    status: STATUS[item.status] ?? 'pending',
  }));
}

/**
 * 线上任务 → 本仓库的 `habits`（IMPORT-17）。
 *
 * **P7 第二段之前这里是 `habits: onlineJson.tasks` 整份透传**，于是导入一份线上存档，
 * 18 条任务的产出值全读不到（`rewardOf` 读 `starReward`，线上叫 `starsReward`）、
 * `core` 全都缺席（今日全勤永久不发）—— 合法但不生效。
 *
 * 三处不是恒等映射：
 *
 * 1. 两个产出值**改名**：`starsReward` → `starReward`、`foodPointsReward` → `petFoodReward`。
 * 2. `subCategory` **不接**：线上只写不读，本仓库没有这个概念
 *    （与 `data/defaultHabits.js` 不转抄它同一条）。
 * 3. `core` 落 `false`：线上没有「今日全勤名单」这个概念。**不按 id 猜** ——
 *    在这里写一张 id → `core` 的对照表，等于把 P3-b 刚从 `utils/` 搬到元素上的
 *    那份平行名单又建了一遍（docs/glossary.md「`core` 只是一个字段，不是一份名单」）。
 *    代价是导入后全勤要家长自己在家长端勾回来，而那正是家长端第二段给的入口。
 *
 * 其余字段同名原样带过去，夹范围与条件保留（`module` / `weeklyTarget`）
 * 由 `normalizeSave` 的 `habits` 收敛做 —— 白名单只在那一处维护。
 *
 * @param {unknown} value 线上的 `tasks`
 * @returns {object[]} 交给 normalizeSave 收敛
 */
function habitsFromOnline(value) {
  if (!Array.isArray(value)) return [];

  return value.filter(isPlainObject).map((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    category: item.category,
    frequency: item.frequency,
    starReward: item.starsReward,
    petFoodReward: item.foodPointsReward,
    needsParentConfirm: item.needsParentConfirm,
    enabled: item.enabled,
    sortOrder: item.sortOrder,
    core: false,
    module: item.module,
    weeklyTarget: item.weeklyTarget,
  }));
}

/**
 * 线上一天的记录 → 本仓库的 `days[dayKey]`（`IMPORT-19` ~ `21`）。
 *
 * **P7 第三段之前这里是 `days: onlineJson.dailyRecords` 整份透传**，与 `habits`
 * 一模一样的错误形状连着犯了两次：`habits` 是「合法但不生效」，`days` 是
 * 「合法但一条都读不出来」—— `utils/reward.js` 有四条判据读 `day.checks` /
 * `day.learning.reading` / `day.bonuses.allDone`，而线上那三个键分别叫
 * `completedTasks` / `learning.reading`（多两个字段）/ `bonuses.dailyAllDone`。
 * **规律：整份透传的顶层键，在有人第一次读它的内部结构时才暴露它没被映射。**
 *
 * 五处不是恒等映射：
 *
 * 1. `completedTasks` → `checks`，且 **`completed !== true` 的元素不写键**：
 *    线上取消打卡留一条 `{ completed: false }` 的墓碑（`:272460`），而本仓库
 *    `uncheck` 删键 —— `HABIT` 区的不变式是「键存在即已打卡」。留一个 `{ at: 0 }`
 *    会让 `isChecked` 说打过，而它记录的恰恰是「取消了」。
 * 2. `bonuses.dailyAllDone` → `bonuses.allDone`（`:244902`）。
 * 3. `ledger[]` 四个货币改名，**缺的一律补 `0`**：线上 `br`（`:243866`）写
 *    `{ stars, foodPoints, gems, medals }` 四个键，而调用方多数只传前两个 ——
 *    大部分流水行的 `gems` / `medals` 是 `undefined`。不补 `0`，`dayEarned`
 *    那类求和会变 `NaN`，而 `NaN` 在界面上显示成「NaN⭐」且不抛错。
 *    顺带丢掉元素的 `id`（`postLedger`：数组下标就是它的身份）。
 * 4. `learning` 五个子键各自映射，丢掉三样东西，理由都不是「用不上」：
 *    `reading` / `english` 丢 `completed`（**完成状态只能有一个真相**，那就是
 *    `checks` —— `learning.js::isDone` 已经写下这条）；`reading` 丢
 *    `coverDataUrl`（一整张 base64 图片，`:663518`，小程序单 key 上限 1MB、
 *    整体 10MB，几十天封面就能撑爆，而它在本仓库没有显示位置）；
 *    `literacy` 丢 `mastered`（本仓库从 `chars[字].step >= 7` 现算，
 *    存一份当天快照就是第二个真相）。
 * 5. `date` 不接（与它自己的键重复）。
 *
 * `health` 的**十一个字段名全部恒等**，是全表唯一一个恒等映射 —— 本仓库当初就是
 * 照线上那张表抄的（`health.js` 的 `FIELDS`）。这一半刻意与 `ledger` 那一半
 * 放在同一条规格里（`IMPORT-20`）：一个「整份透传 `learning` 和 `health`、
 * 只映射 `checks`」的实现能过 `IMPORT-19`，但过不了 `IMPORT-21`。
 *
 * 夹范围与坏值收敛不在这里做：`normalizeSave` 对 `days` 仍是整体透传
 * （**一个键可以「有映射但不收敛」**，见 docs/features/storage/doc.md），
 * 而各域的读函数本来就对自己那一块做防御（`todayOf` / `learningOf` / `ledgerOf`）。
 *
 * @param {unknown} value 线上的 `dailyRecords`
 * @returns {object} 键仍是日期键，值是本仓库形状的当天记录
 */
function daysFromOnline(value) {
  if (!isPlainObject(value)) return {};

  const out = {};
  for (const [key, record] of Object.entries(value)) {
    if (!isPlainObject(record)) continue;
    out[key] = dayFromOnline(record);
  }
  return out;
}

/**
 * 线上一天的四个子结构 → 本仓库的四个（`checks` / `ledger` / `learning` / `health`）。
 *
 * 只写「源里有」的键：线上一份记录可能只有 `completedTasks`，
 * 凭空补一个空 `learning` 会让「那天有没有学习记录」多出一个假答案
 * （`reading_days` 那条成就读的正是 `day.learning?.reading !== undefined`）。
 *
 * @param {object} record 线上的一天
 * @returns {object} 本仓库的一天
 */
function dayFromOnline(record) {
  const day = {};

  if (isPlainObject(record.completedTasks)) day.checks = checksFromOnline(record.completedTasks);
  if (Array.isArray(record.ledger)) day.ledger = ledgerFromOnline(record.ledger);
  if (isPlainObject(record.learning)) day.learning = learningFromOnline(record.learning);
  if (isPlainObject(record.health)) day.health = { ...record.health };
  if (isPlainObject(record.bonuses) && record.bonuses.dailyAllDone === true) {
    day.bonuses = { allDone: true };
  }

  return day;
}

/**
 * `completedTasks` → `checks`。墓碑（`completed !== true`）**不写键**。
 *
 * @param {object} source 线上的 `completedTasks`
 * @returns {object} `{ [habitId]: { at } }`
 */
function checksFromOnline(source) {
  const checks = {};
  for (const [habitId, item] of Object.entries(source)) {
    if (!isPlainObject(item) || item.completed !== true) continue;
    checks[habitId] = { at: toMs(item.completedAt, 0) };
  }
  return checks;
}

/**
 * `ledger[]` 的改名与补零。四个货币缺一个都补 `0`，否则求和出 `NaN`。
 *
 * @param {unknown[]} source 线上的 `ledger`
 * @returns {object[]} 本仓库的流水
 */
function ledgerFromOnline(source) {
  return source.filter(isPlainObject).map((item) => {
    const amount = { star: 0, gem: 0, petFood: 0, medal: 0 };
    for (const [from, to] of Object.entries(CURRENCY_MAP)) {
      if (typeof item[from] === 'number' && Number.isFinite(item[from])) amount[to] = item[from];
    }

    // id 刻意不接 —— 本仓库的流水没有 id
    return { at: toMs(item.at, 0), type: item.type, reason: item.reason, ...amount };
  });
}

/**
 * `learning` 的五个子键。`reading` / `english` 近似恒等（各减一两个字段），
 * `literacy` / `guoxue` / `math` 换形状。
 *
 * `guoxue`：线上一天一首（`{ poemId, learned, recited }`，`:273074`），
 * 本仓库是一个列表（`{ poems: [...] }`）—— 一天能学多首。
 * `math`：线上三个次数（`{ gamesPlayed, gamesCorrect, stage }`，`:273483`），
 * 本仓库是 `{ rounds, correct }`；`rounds` 落 `[]`，与 `IMPORT-15` 同一处损失
 * （次数换不出题目 id，见 mathFromOnline 的头注释）。
 *
 * @param {object} source 线上的 `learning`
 * @returns {object} 本仓库的 `learning`
 */
function learningFromOnline(source) {
  const out = {};

  // completed 与 coverDataUrl 刻意不接
  if (isPlainObject(source.reading))
    out.reading = omit(source.reading, ['completed', 'coverDataUrl']);
  if (isPlainObject(source.english)) out.english = omit(source.english, ['completed']);

  if (isPlainObject(source.literacy)) {
    // mastered 刻意不接 —— 从 chars[字].step >= 7 现算
    const literacy = {};
    if (source.literacy.newChars !== undefined) literacy.newChars = source.literacy.newChars;
    if (source.literacy.reviewedChars !== undefined) {
      literacy.reviewed = source.literacy.reviewedChars;
    }
    out.literacy = literacy;
  }

  if (isPlainObject(source.guoxue)) {
    out.guoxue = { poems: typeof source.guoxue.poemId === 'string' ? [source.guoxue.poemId] : [] };
  }

  if (isPlainObject(source.math)) {
    const correct = source.math.gamesCorrect;
    out.math = {
      rounds: [],
      correct: typeof correct === 'number' && Number.isFinite(correct) ? correct : 0,
    };
  }

  return out;
}

/**
 * 把线上导出的 JSON 转成本仓库的存档。
 *
 * @param {object} onlineJson 线上「导出数据」得到的对象（已 JSON.parse）
 * @returns {object} 合法存档
 */
export function importOnlineSave(onlineJson) {
  if (!isPlainObject(onlineJson)) {
    throw new TypeError(`importOnlineSave 需要一个对象，收到 ${typeof onlineJson}`);
  }

  const base = defaultSave();
  const profile = isPlainObject(onlineJson.profile) ? onlineJson.profile : {};

  const mapped = {
    version: 1,
    childName: profile.name,
    childAvatar: profile.avatarEmoji,
    currency: rename(onlineJson.currency, CURRENCY_MAP),
    pet: rename(onlineJson.pet, PET_MAP),
    habits: habitsFromOnline(onlineJson.tasks),
    days: daysFromOnline(onlineJson.dailyRecords),
    redemptions: redemptionsFromOnline(onlineJson.exchangeRecords),
    achievements: onlineJson.unlockedMedals,
    // 形状与本仓库一致（周一的日期键），原样带过去；线上无此键时由 normalizeSave 落空串
    lastWeeklyBonusWeek: onlineJson.lastWeeklyBonusWeek,
    // 贴纸两个键都是**同名恒等映射**，但**不是整份透传**：收敛在 normalizeSave 里做，
    // 所以一份带 0 值、带小数、带脏 id 的线上收藏册进来会被收拾干净（IMPORT-22）
    stickerCollection: onlineJson.stickerCollection,
    lastFreeStickerDate: onlineJson.lastFreeStickerDate,
    learningProgress: {
      literacy: literacyFromOnline(
        isPlainObject(onlineJson.learningProgress)
          ? onlineJson.learningProgress.literacy
          : undefined,
      ),
      guoxue: guoxueFromOnline(
        isPlainObject(onlineJson.learningProgress) ? onlineJson.learningProgress.guoxue : undefined,
      ),
      math: mathFromOnline(
        isPlainObject(onlineJson.learningProgress) ? onlineJson.learningProgress.math : undefined,
      ),
    },
    parent: rename(onlineJson.parentSettings, PARENT_MAP),
    soundEnabled: onlineJson.soundEnabled,
    createdAt: toMs(onlineJson.createdAt, base.createdAt),
    updatedAt: toMs(onlineJson.updatedAt, base.updatedAt),
  };

  // 交给 normalizeSave 做补齐与收敛：白名单在那一处维护，两边不重复写
  return normalizeSave(mapped);
}
