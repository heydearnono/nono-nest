/**
 * 积分与流水。
 *
 * 规格来源：docs/features/point/doc.md（`POINT` 区）
 *
 * 与 `habit.js` 的关系：本模块 import 它，反向不许。打卡本身（`HABIT` 区）
 * 不知道积分存在，所以 `HABIT-01` ~ `HABIT-17` 不受本模块影响。
 *
 * 打卡与发放**合成一个函数**，不留给页面两步走：两步走意味着页面可以只做一步，
 * 「每条 checks 项都有一条对应的 earn 流水」这个不变式就没有东西保证它。
 *
 * P3-b 追加今日全勤与周奖励两处产出（`POINT-20` ~ `POINT-31`），并把私有的 `post`
 * 导出成 `postLedger` —— 于是 `save.currency` 只可能被本模块改，每改一次都追加一条流水。
 * 判定与结算的**编排**在 `utils/reward.js` 的 `settleDay`，本模块只管这两笔产出本身。
 */

import { weekKeys } from './dayKey.js';
import { check, findHabit, isChecked, uncheck } from './habit.js';

/** 流水里的币种，顺序固定 —— 四个字段恒定存在，没变动的填 0，读取方不必 `?? 0` */
const CURRENCIES = ['star', 'gem', 'petFood', 'medal'];

/**
 * 周奖励的数额与阈值，数字抄线上（`pointRules.weeklyBonus`）。
 *
 * `minDays` 一个数扛两个角色：**一天里核心项完成 ≥ 5 条**算达标日，
 * **一周里达标 ≥ 5 天**发周奖励。线上也是同一个数，而 `full-week` 成就要用第二个角色，
 * 所以整个常量导出去 —— 让 `reward.js` 自己写一个 `5` 就是第二套口径。
 */
export const WEEKLY_BONUS = { star: 5, gem: 1, minDays: 5 };

/**
 * 一个四币种全为 0 的量。
 *
 * @returns {{ star: number, gem: number, petFood: number, medal: number }}
 */
function zeroAmount() {
  return { star: 0, gem: 0, petFood: 0, medal: 0 };
}

/**
 * 任务一次打卡的产出。
 *
 * **与线上的偏差**：线上按 `task.category` 查 `pointRules` 的三档费率，任务自身的
 * `starsReward` / `foodPointsReward` 是死字段。这里反过来只读任务自身 ——
 * 数值等价、不必给存档加 `pointRules` 顶层键、且「这一项 +1⭐」的依据就在任务身上。
 * 理由见 doc.md。
 *
 * @param {object} habit 任务定义
 * @returns {{ star: number, gem: number, petFood: number, medal: number }}
 */
function rewardOf(habit) {
  return {
    ...zeroAmount(),
    star: Number.isFinite(habit.starReward) ? habit.starReward : 0,
    petFood: Number.isFinite(habit.petFoodReward) ? habit.petFoodReward : 0,
  };
}

/**
 * 当天流水。没有记录时给一个空数组，读取方不必判空。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object[]} 流水条目，发生顺序
 */
export function ledgerOf(save, key) {
  const ledger = save.days?.[key]?.ledger;
  return Array.isArray(ledger) ? ledger : [];
}

/**
 * 把一条流水追加进当天记录，同时把货币按方向加减。
 *
 * `earn` 直接加；`spend` 用 `Math.max(0, ...)` 收敛，货币不出现负数 ——
 * 货币已经花掉时取消打卡会少扣，宁愿少扣也不倒扣
 * （docs/vision.md「什么算好」第 2 条）。此时流水记的是**应扣**的量，
 * 与货币的实际变化刻意不一致：流水是账，货币是余额。
 *
 * **P3-b 起导出**（原名私有的 `post`）。全勤、周奖励、成就解锁、兑换是四处新的
 * 货币变动，都不在本模块里。导出一个「原始」函数看着比 `checkAndAward` 那种成对封装弱，
 * 但它换来一条更强的不变式：**`save.currency` 只可能被 `point.js` 改**，
 * 而它每次改都追加一条流水。四处各自 `{ ...save, currency }` 才会让账与余额悄悄分叉。
 *
 * @param {object} save 存档（不改，返回新对象）
 * @param {string} key 日期键
 * @param {'earn' | 'spend'} type 方向
 * @param {object} amount 四币种的非负量
 * @param {string} reason 人能看懂的原因
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档
 */
export function postLedger(save, key, type, amount, reason, now) {
  const sign = type === 'earn' ? 1 : -1;
  const currency = { ...save.currency };

  for (const name of CURRENCIES) {
    currency[name] = Math.max(0, (currency[name] ?? 0) + sign * (amount[name] ?? 0));
  }

  return {
    ...save,
    currency,
    days: {
      ...save.days,
      [key]: {
        ...(save.days?.[key] ?? {}),
        // 只追加，不删改。流水没有 id：它不按 id 查，数组下标就是它的身份
        ledger: [...ledgerOf(save, key), { at: now, type, reason, ...zeroAmount(), ...amount }],
      },
    },
  };
}

/**
 * 打卡并发放积分。已打过则原样返回（幂等，货币与流水都不动）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档
 */
export function checkAndAward(save, key, habitId, now) {
  const habit = findHabit(save, habitId);
  const checked = check(save, key, habitId, now);
  // check 幂等时返回入参本身（HABIT-06），所以同一性就是「这次没有新打卡」的信号
  if (checked === save) return save;

  return postLedger(checked, key, 'earn', rewardOf(habit), `完成：${habit.name}`, now);
}

/**
 * 取消打卡并扣回积分。没打过则原样返回（幂等）。
 *
 * 扣的是**此刻**任务定义上的产出值，与线上一致。已知边界：家长在打卡之后改了产出值，
 * 当天取消会按新值扣 —— 按发放时的数额退需要改 `HABIT` 区定下的 `checks` 结构，
 * 留到 P7 家长端落地时再评估。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档
 */
export function uncheckAndRefund(save, key, habitId, now) {
  const habit = findHabit(save, habitId);
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
  if (!isChecked(save, key, habitId)) return save;

  const unchecked = uncheck(save, key, habitId);

  return postLedger(unchecked, key, 'spend', rewardOf(habit), `取消：${habit.name}`, now);
}

/**
 * 当天的净额：`earn` 减 `spend`，四个币种分别算。
 *
 * 打卡后又取消，结果是 0 —— 这是「今天挣了多少」的如实显示，
 * 不是货币余额（余额在 `save.currency`，且不会为负）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {{ star: number, gem: number, petFood: number, medal: number }}
 */
export function dayEarned(save, key) {
  const total = zeroAmount();

  for (const entry of ledgerOf(save, key)) {
    const sign = entry.type === 'earn' ? 1 : -1;
    for (const name of CURRENCIES) {
      total[name] += sign * (entry[name] ?? 0);
    }
  }

  return total;
}

/**
 * 启用中的核心打卡项。名单是任务自己的 `core` 字段，不是本模块的常量数组 ——
 * 线上把它存成一个与 `tasks` 平行的 id 数组，家长删掉 `poop` 之后全勤永久不可能达成
 * （理由见 docs/features/reward/doc.md）。
 *
 * 分母跟着 `enabled` 变，与 `dayProgress` 同一条。
 *
 * @param {object} save 存档
 * @returns {object[]} 任务定义
 */
export function listCore(save) {
  const habits = Array.isArray(save.habits) ? save.habits : [];
  return habits.filter((habit) => habit.core && habit.enabled);
}

/**
 * 当天完成了几条核心项。
 *
 * 不走 `isChecked`（它要先 `findHabit`、任务被删就抛错），直接看 `checks` 的键 ——
 * 本函数的入参已经是 `listCore` 筛出来的、确实在 `habits` 里的任务。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {number} 0 ~ 核心项条数
 */
export function coreDone(save, key) {
  const checks = save.days?.[key]?.checks;
  if (typeof checks !== 'object' || checks === null) return 0;

  return listCore(save).filter((habit) => habit.id in checks).length;
}

/**
 * 达标日：当天核心项完成 ≥ `minDays` 条（线上同一个数，5）。
 *
 * **周奖励与 `full-week` 成就共用这一个函数。** 线上那两套口径（核心项 5/8 与
 * 「自律 + 学习的 60%」）算的是同一件事却能给出不同答案 —— P5 识字那一轮的教训：
 * 共用判据要共用的是函数，不是「调用另一个入口」。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {boolean}
 */
export function isQualifiedDay(save, key) {
  return coreDone(save, key) >= WEEKLY_BONUS.minDays;
}

/**
 * 今日全勤：启用中的核心项全部完成则 `+1🏅`，水位是 `days[key].bonuses.allDone`。
 *
 * 已发过（水位为真）或没打满则**原样返回入参**，所以每次打卡都可以调一遍。
 * 核心项一条不剩时不算全勤 —— 否则一条任务都没有的存档天天全勤，每天白发一枚勋章。
 *
 * 全勤后取消一项打卡，勋章不退、水位不清（「温和，不惩罚」，与取消打卡不收回宠物经验同一条）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档，或入参本身
 */
export function awardAllDone(save, key, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
  if (save.days?.[key]?.bonuses?.allDone) return save;

  const core = listCore(save);
  if (core.length === 0 || coreDone(save, key) < core.length) return save;

  const day = save.days?.[key] ?? {};
  const marked = {
    ...save,
    days: { ...save.days, [key]: { ...day, bonuses: { ...day.bonuses, allDone: true } } },
  };

  return postLedger(marked, key, 'earn', { ...zeroAmount(), medal: 1 }, '今日全勤', now);
}

/**
 * 周奖励：本周七天里达标 ≥ `minDays` 天则 `+5⭐ +1💎`，一周一次。
 *
 * 水位是顶层键 `lastWeeklyBonusWeek`，存本周周一的日期键（`weekKeys(now)[0]`）。
 * 空串表示从未发过，`'' !== 本周周键` 天然成立，第一周不需要特判（`SAVE-14`）。
 *
 * 宝石是本仓库唯一由周奖励独占产出的货币，这里不发它就等于宝石永远是 0。
 *
 * 流水写在 `key`（今天）名下，不写在周一名下：流水是「今天发生了什么」的记录，
 * 而这笔奖励确实是今天到账的。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档，或入参本身
 */
export function awardWeeklyBonus(save, key, now) {
  const week = weekKeys(now);
  if (save.lastWeeklyBonusWeek === week[0]) return save;

  const days = week.filter((k) => isQualifiedDay(save, k)).length;
  if (days < WEEKLY_BONUS.minDays) return save;

  const marked = { ...save, lastWeeklyBonusWeek: week[0] };
  const amount = { ...zeroAmount(), star: WEEKLY_BONUS.star, gem: WEEKLY_BONUS.gem };

  return postLedger(marked, key, 'earn', amount, `本周打卡 ${days} 天达标`, now);
}
