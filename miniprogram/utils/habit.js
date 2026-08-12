/**
 * 自律任务与打卡。
 *
 * 规格来源：docs/features/habit/doc.md（`HABIT` 区）
 *
 * 所有函数都**不改传入的 `save`**，改动以新对象返回。页面拿到返回值再写 storage ——
 * 写失败时内存里还是旧存档，不会留下改了一半的状态。
 */

import { DEFAULT_HABITS } from '../data/defaultHabits.js';
import { dayKey } from './dayKey.js';

/** 连续天数往前查的天数上限，与线上一致 */
const STREAK_MAX_DAYS = 30;

/** 首页渲染的类别 —— `learning` / `health` 的页面在 P5 / P6 */
const HOME_CATEGORY = 'habit';

/**
 * `habits` 为空时填入默认任务表；已有内容则原样返回。
 *
 * 默认表放在这里而不是 `defaultSave()`：「默认有哪些自律任务」是 HABIT 的业务决定，
 * 不是存档结构的一部分（否则 utils/save.js 要依赖 data/）。
 *
 * @param {object} save 存档
 * @returns {object} 存档（`habits` 非空时是同一个引用）
 */
export function seedHabits(save) {
  if (Array.isArray(save.habits) && save.habits.length > 0) return save;

  // 深拷一份：默认表是模块级常量，直接塞进存档会让家长端的修改改到常量上
  return { ...save, habits: DEFAULT_HABITS.map((habit) => ({ ...habit })) };
}

/**
 * 首页要渲染的自律任务：`category === 'habit'` 且启用，按 `sortOrder` 升序。
 *
 * @param {object} save 存档
 * @returns {object[]} 任务定义数组
 */
export function listHabits(save) {
  const habits = Array.isArray(save.habits) ? save.habits : [];

  return habits
    .filter((habit) => habit.category === HOME_CATEGORY && habit.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 找任务定义，找不到就抛错。
 *
 * 与线上不同（线上 `find` 失败后静默 return）：首页传的 id 全部来自 `listHabits`，
 * 传错只可能是编程错误，静默会让按钮变成「点了没反应」且不留线索。
 *
 * 导出给 `POINT` 区用 —— 发放积分要读任务上的 `starReward` / `petFoodReward`，
 * 让它自己再写一遍查找与抛错会出现两套「未知 id」的行为。
 *
 * @param {object} save 存档
 * @param {string} habitId 任务 id
 * @returns {object} 任务定义
 */
export function findHabit(save, habitId) {
  const habits = Array.isArray(save.habits) ? save.habits : [];
  const habit = habits.find((item) => item.id === habitId);
  if (!habit) {
    throw new RangeError(`habitId ${JSON.stringify(habitId)} 不在 habits 里`);
  }
  return habit;
}

/**
 * 当天的 `checks`。没有记录时给一个空对象，读取方不必判空。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object} habitId -> { at }
 */
function checksOf(save, key) {
  const day = save.days?.[key];
  return day && typeof day.checks === 'object' && day.checks !== null ? day.checks : {};
}

/**
 * 某项今天打过卡没有。**键存在即已打卡** —— 取消打卡是删键，不留墓碑。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @returns {boolean}
 */
export function isChecked(save, key, habitId) {
  return habitId in checksOf(save, key);
}

/**
 * 打卡。已打过则原样返回（幂等，不刷新 `at`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档
 */
export function check(save, key, habitId, now) {
  findHabit(save, habitId);
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
  if (isChecked(save, key, habitId)) return save;

  const day = save.days?.[key] ?? {};

  return {
    ...save,
    days: {
      ...save.days,
      // day 的其它键（ledger、health……）由各自 feature 增补，这里整体带过去
      [key]: { ...day, checks: { ...checksOf(save, key), [habitId]: { at: now } } },
    },
  };
}

/**
 * 取消打卡。没打过则原样返回（幂等）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @returns {object} 新存档
 */
export function uncheck(save, key, habitId) {
  findHabit(save, habitId);
  if (!isChecked(save, key, habitId)) return save;

  const day = save.days[key];
  const checks = { ...checksOf(save, key) };
  delete checks[habitId];

  return { ...save, days: { ...save.days, [key]: { ...day, checks } } };
}

/**
 * 当天进度。`total` 是**当前启用的**自律任务数，家长停用一项后分母跟着变，
 * 否则进度永远到不了满格。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {{ done: number, total: number }}
 */
export function dayProgress(save, key) {
  const habits = listHabits(save);
  const checks = checksOf(save, key);

  return {
    done: habits.filter((habit) => habit.id in checks).length,
    total: habits.length,
  };
}

/**
 * 连续天数：从今天往前数，「至少完成一项自律任务」的连续自然日数。
 *
 * 今天一项没打就是 0 —— 不是惩罚（积分与勋章都不动），只是「今天还没开始」的如实显示。
 * 上限 30 天给首页一个 O(30) 的上界，不必为一个数字扫完整个 `days`。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {number} 0 ~ 30
 */
export function habitStreak(save, now) {
  const habits = listHabits(save);
  if (habits.length === 0) return 0;

  // 用 setDate 往前退而不是减 86400000：夏令时切换日的长度不是 24 小时，
  // 固定毫秒数会算错日期键
  const cursor = new Date(now);
  let streak = 0;

  for (let i = 0; i < STREAK_MAX_DAYS; i += 1) {
    const checks = checksOf(save, dayKey(cursor.getTime()));
    if (!habits.some((habit) => habit.id in checks)) break;

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
