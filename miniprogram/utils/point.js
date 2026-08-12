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
 */

import { check, findHabit, isChecked, uncheck } from './habit.js';

/** 流水里的币种，顺序固定 —— 四个字段恒定存在，没变动的填 0，读取方不必 `?? 0` */
const CURRENCIES = ['star', 'gem', 'petFood', 'medal'];

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
 * @param {object} save 存档（不改，返回新对象）
 * @param {string} key 日期键
 * @param {object} day 当天记录（已含本次要写的 `checks`）
 * @param {'earn' | 'spend'} type 方向
 * @param {object} amount 四币种的非负量
 * @param {string} reason 人能看懂的原因
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档
 */
function post(save, key, day, type, amount, reason, now) {
  const sign = type === 'earn' ? 1 : -1;
  const currency = { ...save.currency };

  for (const name of CURRENCIES) {
    currency[name] = Math.max(0, (currency[name] ?? 0) + sign * amount[name]);
  }

  return {
    ...save,
    currency,
    days: {
      ...save.days,
      [key]: {
        ...day,
        // 只追加，不删改。流水没有 id：它不按 id 查，数组下标就是它的身份
        ledger: [...ledgerOf(save, key), { at: now, type, reason, ...amount }],
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

  return post(checked, key, checked.days[key], 'earn', rewardOf(habit), `完成：${habit.name}`, now);
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

  return post(
    unchecked,
    key,
    unchecked.days[key],
    'spend',
    rewardOf(habit),
    `取消：${habit.name}`,
    now,
  );
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
