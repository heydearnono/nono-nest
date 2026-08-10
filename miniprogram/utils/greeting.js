/**
 * 按时段生成问候语。
 *
 * 抽成纯函数是为了能在 Node 环境下直接单测，不依赖小程序运行时。
 * 后续所有业务规则（饥饿度、心情值衰减等）都应遵循同样的做法。
 *
 * @param {number} hour 24 小时制的小时数，取值 0-23
 * @returns {string} 问候语
 */
export function greetingFor(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour 必须是 0-23 的整数，收到 ${hour}`);
  }

  if (hour < 6) return '夜深了，小宠物在打呼噜';
  if (hour < 11) return '早上好，糯糯';
  if (hour < 14) return '午安，该吃饭啦';
  if (hour < 18) return '下午好，一起玩吧';
  return '晚上好，糯糯';
}
