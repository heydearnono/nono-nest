/**
 * 勋章闭环：兑换、成就、奖励结算。
 *
 * 规格来源：docs/features/reward/doc.md（`REWARD` / `ACHV` 两个区）
 *
 * 依赖方向 reward.js → point.js → habit.js → dayKey.js → data/，无环。
 * **本模块不 import `pet.js`**（`pet-5` 直接读 `save.pet.petLevel`），
 * 反过来是 `pet.js` import 本模块 —— `checkAwardAndGrow` 末尾调 `settleDay`，
 * 于是每一次打卡都必然结算一次奖励，不留给五个页面各自调。
 *
 * **货币只由 `point.js` 改。** 本模块四处产出（全勤、周奖励、成就、兑换）全部走
 * `postLedger`，所以「流水加起来等于余额」这条不变式在本轮之后仍然成立 ——
 * 线上的成就勋章不进流水，那个不变式在线上不成立。
 *
 * **进度每次现算，不存。** 线上存 `medalProgress` 快照且解锁后不再更新，
 * 于是已解锁成就的进度条永远停在解锁那一刻。没有快照就不会有停住的快照。
 */

import { ACHIEVEMENTS } from '../data/achievements.js';
import { REWARDS } from '../data/rewards.js';
import { dayKey, weekKeys } from './dayKey.js';
import {
  WEEKLY_BONUS,
  awardAllDone,
  awardWeeklyBonus,
  coreDone,
  isQualifiedDay,
  listCore,
  postLedger,
} from './point.js';

/** 连续天数往前查的天数上限，与 `habitStreak` 同一个数（给读取路径一个 O(30) 的上界） */
const STREAK_MAX_DAYS = 30;

/** 兑换记录的状态文案。页面不自己映射，见 doc.md */
const STATUS_TEXT = { pending: '待家长兑现', done: '已兑现' };

/**
 * 找奖励项定义，找不到就抛错。
 *
 * 与 `findHabit` 同一条：页面上的按钮是 `rewardState` 渲染出来的，
 * 传别的值只可能是代码写错，静默会让按钮变成「点了没反应」且不留线索。
 *
 * @param {string} rewardId 奖励项 id
 * @returns {object} 奖励项定义
 * @throws {RangeError} 未登记的 id
 */
function findReward(rewardId) {
  const reward = REWARDS.find((item) => item.id === rewardId);
  if (!reward) {
    throw new RangeError(`rewardId ${JSON.stringify(rewardId)} 不在 data/rewards.js 里`);
  }
  return reward;
}

/**
 * 存档里的兑换记录，缺失或坏结构时给空数组。
 *
 * 元素的收敛由 `normalizeSave` 做过（`SAVE-15`），这里只保证是个数组 ——
 * 页面可能拿到手拼的存档（测试、导入中途），读取路径不抛错（`REWARD-15`）。
 *
 * @param {object} save 存档
 * @returns {object[]} 兑换记录，最新在前
 */
function redemptionsOf(save) {
  return Array.isArray(save.redemptions) ? save.redemptions : [];
}

/**
 * 已解锁的成就 id。
 *
 * @param {object} save 存档
 * @returns {Set<string>}
 */
function unlockedOf(save) {
  return new Set(
    (Array.isArray(save.achievements) ? save.achievements : []).filter(
      (id) => typeof id === 'string',
    ),
  );
}

/**
 * 某项任务从今天往前数的连续打卡天数，上限 30。
 *
 * 与 `habitStreak`（「至少完成一项」）不同：这里数的是**指定一项**，
 * 所以不能复用它。上限与理由同一条。
 *
 * @param {object} save 存档
 * @param {string} habitId 任务 id
 * @param {number} now 毫秒时间戳
 * @returns {number} 0 ~ 30
 */
function streakOf(save, habitId, now) {
  // 用 setDate 往前退而不是减 86400000：夏令时切换日不是 24 小时
  const cursor = new Date(now);
  let streak = 0;

  for (let i = 0; i < STREAK_MAX_DAYS; i += 1) {
    if (!(habitId in (save.days?.[dayKey(cursor.getTime())]?.checks ?? {}))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/**
 * 满足条件的天数（累计，扫整个 `days`）。
 *
 * 一年 365 个键，不设上限 —— 线上也是全扫。
 *
 * @param {object} save 存档
 * @param {(day: object) => boolean} pass 一天算不算
 * @returns {number}
 */
function countDays(save, pass) {
  const days = typeof save.days === 'object' && save.days !== null ? save.days : {};

  return Object.values(days).filter((day) => {
    if (typeof day !== 'object' || day === null) return false;
    return pass(day);
  }).length;
}

/**
 * 十一条判据，按 `condition` 注册（与 `health.js` 的 `FIELDS` 注册表同构）。
 *
 * 常量表说「用哪条判据」，怎么算在这里。加一条成就 = 那边加一行 + 这里加一个函数；
 * 忘了写判据的后果是 `RangeError` 而不是静默的 0（见 `judgeOf`）。
 *
 * 每个函数返回**进度数值**（不是布尔），阈值比较在 `progressOf` 统一做 ——
 * `full-week` 的阈值是 1，所以它返回 0 或 1。
 */
const JUDGES = {
  habit_wake: (save, key, now) => streakOf(save, 'wake', now),
  habit_brush: (save, key, now) => streakOf(save, 'brush-am', now),
  reading_days: (save) => countDays(save, (day) => day.learning?.reading !== undefined),
  // 数「学过」而不是「已掌握」：本仓库的掌握要熬完六个间隔跨 58 天，
  // 照线上数 masteredChars 这条成就头两个月结构性不可达（ACHV-05）
  chars_learned: (save) => Object.keys(save.learningProgress?.literacy?.chars ?? {}).length,
  // 古诗与数学那两轮才有这两个子键 —— 都做完了，两条都在数真实的进度
  poems_mastered: (save) =>
    Object.values(save.learningProgress?.guoxue?.poems ?? {}).filter((p) => p?.mastered).length,
  // 数「答对过的题数」而不是「答题次数」：线上那个 gamesCompleted 每答一题就 +1、
  // 无去重，连点十次同一道题就解锁（docs/features/math/doc.md 缺陷 5）。
  // 本文件不能 import math.js（会成环），所以判据从存档上直接读 —— rounds 是一层对象、
  // correct 是布尔，不需要知道六个阶段各有哪五道题，也就不 import data/mathRounds.js
  math_games: (save) =>
    Object.values(save.learningProgress?.math?.rounds ?? {}).filter((r) => r?.correct).length,
  veggie_week: (save, key, now) =>
    weekKeys(now).filter((k) => 'vegetables' in (save.days?.[k]?.checks ?? {})).length,
  room_tidy: (save) => countDays(save, (day) => 'room' in (day.checks ?? {})),
  full_week: (save, key, now) =>
    weekKeys(now).filter((k) => isQualifiedDay(save, k)).length >= WEEKLY_BONUS.minDays ? 1 : 0,
  pet_level: (save) => save.pet?.petLevel ?? 0,
  daily_all_done: (save) => countDays(save, (day) => day.bonuses?.allDone === true),
};

/**
 * 取判据函数，未注册就抛错。
 *
 * 常量表加了行却忘了写判据，要在测试里立刻炸掉，不能静默返回 0 ——
 * 一条永远 `0/N` 的成就在界面上看不出是 bug 还是「还没达成」。
 *
 * @param {string} condition 判据名
 * @returns {Function}
 * @throws {RangeError} 未注册的 condition
 */
function judgeOf(condition) {
  const judge = JUDGES[condition];
  if (!judge) {
    throw new RangeError(`未注册的成就判据 ${condition}`);
  }
  return judge;
}

/**
 * 一条成就此刻的进度。
 *
 * @param {object} achievement 成就定义
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {number} now 毫秒时间戳
 * @returns {number}
 */
function progressOf(achievement, save, key, now) {
  const value = judgeOf(achievement.condition)(save, key, now);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 奖励中心的读取入口：货币、三张兑换卡、兑换记录、今日全勤与本周进度。
 *
 * **不抛错**（渲染宽容）：核心任务被删、`redemptions` 有脏元素都只影响数值。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @param {number} now 毫秒时间戳
 * @returns {object} 页面直接绑的数据
 */
export function rewardState(save, key, now) {
  const medal = save.currency?.medal ?? 0;
  const core = listCore(save);
  const week = weekKeys(now);

  return {
    medal,
    gem: save.currency?.gem ?? 0,
    // affordable 在这里算好，页面不自己比 medal >= medalCost
    items: REWARDS.map((reward) => ({ ...reward, affordable: medal >= reward.medalCost })),
    redemptions: redemptionsOf(save).map((item) => ({
      ...item,
      statusText: STATUS_TEXT[item.status] ?? STATUS_TEXT.pending,
    })),
    // 今天这枚全勤勋章发过了没有 —— 读的就是水位本身
    allDone: save.days?.[key]?.bonuses?.allDone === true,
    coreDone: coreDone(save, key),
    coreTotal: core.length,
    weekBonus: {
      days: week.filter((k) => isQualifiedDay(save, k)).length,
      minDays: WEEKLY_BONUS.minDays,
      done: save.lastWeeklyBonusWeek === week[0],
    },
  };
}

/**
 * 成就墙的读取入口：十一行，各带此刻的进度与解锁状态。
 *
 * 进度**现算**，不读存档里的快照（本仓库没有那个字段）。**不抛错**：
 * `learningProgress` 缺子键、`achievements` 里有脏值都只影响数值。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @param {number} now 毫秒时间戳
 * @returns {object[]} 十一条
 */
export function achievementState(save, key, now) {
  const unlocked = unlockedOf(save);

  return ACHIEVEMENTS.map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    icon: achievement.icon,
    description: achievement.description,
    progress: Math.min(achievement.threshold, progressOf(achievement, save, key, now)),
    threshold: achievement.threshold,
    // 进度会回落（veggie-5 / full-week 是本周口径），但已解锁不撤销：
    // 成就是「达成过」的记录，不是当前状态（ACHV-13）
    unlocked: unlocked.has(achievement.id),
  }));
}

/**
 * 申请兑换：**此刻就扣勋章**，记录落 `status: 'pending'`（界面上「待家长兑现」）。
 *
 * **这是本轮偏离线上的一处。** 线上申请时不扣、家长批准时才扣，于是中间孩子把勋章
 * 花掉，那条 pending 就永远批不了（`approveExchange` 里余额不够直接 return，
 * 既不提示也不删记录）。申请即扣同时让本轮不需要写没有调用点的审批函数。
 *
 * 勋章不够时**原样返回入参**（正常状态，页面按 `affordable` 置灰）；
 * 未登记的 `rewardId` 抛 `RangeError`（编程错误）。两种错误策略的理由见
 * `AGENTS.md` 第 5 节第 6 条。
 *
 * `name` / `icon` / `medalCost` 写进记录是**快照**：家长将来改了名字或价格，
 * 历史记录仍显示当时兑的是什么、花了多少。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} rewardId 奖励项 id
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档；勋章不够时返回入参本身
 */
export function redeem(save, key, rewardId, now) {
  const reward = findReward(rewardId);
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
  if ((save.currency?.medal ?? 0) < reward.medalCost) return save;

  const record = {
    at: now,
    rewardId: reward.id,
    name: reward.name,
    icon: reward.icon,
    medalCost: reward.medalCost,
    status: 'pending',
  };
  // 最新在前，与线上的 unshift 一致
  const withRecord = { ...save, redemptions: [record, ...redemptionsOf(save)] };

  return postLedger(
    withRecord,
    key,
    'spend',
    { star: 0, gem: 0, petFood: 0, medal: reward.medalCost },
    `兑换：${reward.name}`,
    now,
  );
}

/**
 * 成就解锁：逐条判、够阈值就进 `achievements`、发一枚勋章、写一条流水。
 *
 * **解锁给的勋章要进流水**（第四处偏离线上）：线上不写，于是「流水加起来等于余额」
 * 在线上不成立。本仓库 `POINT-10` 已经把「流水是账、货币是余额」定成不变式。
 *
 * 一次可以解锁多条（线上也是循环里 push）。没有可解锁的成就时**原样返回入参**。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档；无事发生时返回入参本身
 */
export function unlockAchievements(save, key, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const unlocked = unlockedOf(save);
  let next = save;

  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    // 进度从 next 现算：同一次调用里前一条解锁的勋章不影响判据，但顺序仍然确定
    if (progressOf(achievement, next, key, now) < achievement.threshold) continue;

    const withId = { ...next, achievements: [...unlockedOf(next), achievement.id] };
    next = postLedger(
      withId,
      key,
      'earn',
      { star: 0, gem: 0, petFood: 0, medal: 1 },
      `解锁成就：${achievement.name}`,
      now,
    );
  }

  return next;
}

/**
 * 一天的奖励结算：今日全勤 → 周奖励 → 成就解锁。**顺序是规格**（`REWARD-11`）。
 *
 * **全勤必须在成就之前**：`daily-3` 数的是 `bonuses.allDone` 的天数，若成就先跑，
 * 今天刚打满的这一天要等到下次结算才被数进去 —— 孩子会看到「今天全勤了，
 * 但『累计 3 天全勤』的进度没动」。周奖励与另外两件互不依赖，顺序仍然钉住，
 * 免得下一个人按字母序重排。
 *
 * 三步各自看自己的水位，什么都没发生时**原样返回入参**（对象同一性），
 * 页面 `if (next === this.save) return` 就不落盘。所以它可以在每次打卡、
 * 每次 `onShow` 都调一遍。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档；无事发生时返回入参本身
 */
export function settleDay(save, key, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const afterAllDone = awardAllDone(save, key, now);
  const afterWeekly = awardWeeklyBonus(afterAllDone, key, now);

  return unlockAchievements(afterWeekly, key, now);
}
