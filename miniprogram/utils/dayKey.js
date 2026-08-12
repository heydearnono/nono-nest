/**
 * 自然日：把毫秒时间戳换成 `YYYY-MM-DD` 的日期键。
 *
 * 规格来源：docs/features/storage/doc.md（`DAY` 区）
 *
 * 用**本机时区**的 0 点做跨日边界，不用 UTC —— 线上工作台就是这么做的，
 * 换成 UTC 会让晚上 8 点后的打卡算到第二天（见 doc.md「自然日」）。
 */

/**
 * @param {number} now 毫秒时间戳
 * @returns {string} `YYYY-MM-DD`（本机时区）
 */
export function dayKey(now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const d = new Date(now);
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 两个时刻是否在同一个自然日。
 *
 * @param {number} a 毫秒时间戳
 * @param {number} b 毫秒时间戳
 * @returns {boolean}
 */
export function isSameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

/**
 * 本周的七个日期键，**周一为起点**。
 *
 * 周日归到它前面那个周一（`getDay()` 的周日是 `0`，所以单独走 `-6`）——
 * 直接用 `1 - 0` 会把周日推到还没开始的那一周，「周日晚上洗了澡」就不算本周了。
 *
 * 把时刻锚到中午再逐天推进：夏令时切换的那天 0 点前后加减一天会差一小时，
 * 中午留了 12 小时余量，怎么切都还在同一个自然日里。
 *
 * @param {number} now 毫秒时间戳
 * @returns {string[]} 七个 `dayKey`，周一 … 周日
 */
export function weekKeys(now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const d = new Date(now);
  const weekday = d.getDay();
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(d.getDate() + (weekday === 0 ? -6 : 1 - weekday));

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday.getTime());
    day.setDate(monday.getDate() + i);
    return dayKey(day.getTime());
  });
}
