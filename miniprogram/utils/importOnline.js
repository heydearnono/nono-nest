/**
 * 线上工作台 JSON 的一次性导入。
 *
 * 规格来源：docs/features/storage/doc.md（`IMPORT` 区）
 *
 * 与 `normalizeSave` 的错误策略**相反**：导入非法输入要抛错。
 * 用户是主动粘贴 JSON 的，静默用默认值会让他以为导入成功了、实际清零 ——
 * 那正是数据迁移要避免的事故（见 docs/vision.md「数据迁移」）。
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
    redemptions: onlineJson.exchangeRecords,
    achievements: onlineJson.unlockedMedals,
    parent: rename(onlineJson.parentSettings, PARENT_MAP),
    soundEnabled: onlineJson.soundEnabled,
    createdAt: toMs(onlineJson.createdAt, base.createdAt),
    updatedAt: toMs(onlineJson.updatedAt, base.updatedAt),
  };

  // 交给 normalizeSave 做补齐与收敛：白名单在那一处维护，两边不重复写
  return normalizeSave(mapped);
}
