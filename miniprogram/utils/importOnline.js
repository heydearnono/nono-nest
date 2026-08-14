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
 * （线上 PIN 输错无限次、没有节流，见 docs/features/parent/doc.md）。
 * 同一条规律的三处执行 —— 线上没有的概念，导入时不猜。
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
 * 状态三值映射成两值：`approved` → `'done'`、`pending` 保持，
 * **`rejected` 整条丢掉** —— 本仓库没有「已取消」这个状态，留着它会在兑换记录页
 * 显示一条无论如何都不会兑现的条目。
 *
 * @param {unknown} value 线上的 `exchangeRecords`
 * @returns {object[]} 交给 normalizeSave 收敛
 */
function redemptionsFromOnline(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .filter((item) => item.status !== 'rejected')
    .map((item) => ({
      at: toMs(item.requestedAt, 0),
      rewardId: item.rewardId,
      name: item.rewardName,
      icon: '',
      medalCost: item.medalCost,
      status: item.status === 'approved' ? 'done' : 'pending',
    }));
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
    habits: onlineJson.tasks,
    days: onlineJson.dailyRecords,
    redemptions: redemptionsFromOnline(onlineJson.exchangeRecords),
    achievements: onlineJson.unlockedMedals,
    // 形状与本仓库一致（周一的日期键），原样带过去；线上无此键时由 normalizeSave 落空串
    lastWeeklyBonusWeek: onlineJson.lastWeeklyBonusWeek,
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
