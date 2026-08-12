/**
 * 健康域：当天的饮食 / 便便 / 洗澡 / 运动记录，以及其中四项的打卡发放。
 *
 * 规格来源：docs/features/health/doc.md（`HEALTH` 区）
 *
 * 依赖方向 health.js → pet.js → point.js → habit.js → dayKey.js，无环。
 * 与 learning.js 互不引用 —— 两个域除了都用 `checkAwardAndGrow` 之外没有共同概念。
 *
 * **十一个字段，只有四个发放。** `vegetables` / `poop` / `bath` / `exercise` 在
 * `data/defaultHabits.js` 里有对应任务，其余七个只是「记一笔给家长看」。
 * 要给 `fruit` / `water` 发放就得往那张表里加两条任务，而它的 id 集合是今日全勤的
 * 分母 —— 加两条会让「今日全勤」的含义在没人拍板的情况下变掉（见 doc.md）。
 */

import { weekKeys } from './dayKey.js';
import { findHabit } from './habit.js';
import { uncheckAndRefund } from './point.js';
import { checkAwardAndGrow } from './pet.js';

/** 糖数的上限，抄线上 `<input type="number" min=0 max=20>` */
const SUGAR_MAX = 20;

/** 便便心情的三个 emoji，抄线上，顺序即界面顺序。空串 = 还没选 */
const POOP_ICONS = ['😊', '😐', '😣'];

/**
 * 十一个字段的登记表 —— 「哪些字段存在、各是什么类别、哪些连着任务」只在这里说一次。
 *
 * - `kind`：`bool` 走 `toggleHealth`，`count` / `pick` 走 `setHealth`。传错类别抛
 *   `RangeError`（`HEALTH-07` / `HEALTH-16`）：页面上的控件是 `healthState` 渲染出来的，
 *   布尔字段不会出现在数字输入框里，传错只可能是代码写错。
 * - `habitId`：非空即「这个字段的开关连着一次打卡发放」。只有四个。
 * - `turnsOn`：填了值就顺带打开的那个开关。**记录不能自相矛盾** ——
 *   「`poopIcon` 是 😊 但 `poop` 是 `false`」读起来讲不通。只打开、不关闭。
 */
const FIELDS = {
  lessSugar: { kind: 'bool', habitId: '' },
  sugarCount: { kind: 'count', max: SUGAR_MAX },
  vegetables: { kind: 'bool', habitId: 'vegetables' },
  fruit: { kind: 'bool', habitId: '' },
  water: { kind: 'bool', habitId: '' },
  poop: { kind: 'bool', habitId: 'poop' },
  poopIcon: { kind: 'pick', values: POOP_ICONS, turnsOn: 'poop' },
  bath: { kind: 'bool', habitId: 'bath' },
  bathHair: { kind: 'bool', habitId: '' },
  exercise: { kind: 'bool', habitId: 'exercise' },
  exerciseMinutes: { kind: 'count', turnsOn: 'exercise' },
};

/** 洗澡那条任务的 id —— 周计数要读它的 `weeklyTarget` 与 `checks` */
const BATH_HABIT_ID = 'bath';

/**
 * 登记表里的字段定义，未登记就抛错。
 *
 * @param {string} field 字段名
 * @param {'bool' | 'count' | 'pick'} expected 调用方能处理的类别
 * @returns {object} 字段定义
 * @throws {RangeError} 未登记的字段，或类别不是 `expected`
 */
function fieldOf(field, expected) {
  const meta = FIELDS[field];
  if (!meta) {
    throw new RangeError(`未登记的健康字段 ${field}`);
  }
  if (expected === 'bool' && meta.kind !== 'bool') {
    throw new RangeError(`${field} 是取值字段，请用 setHealth`);
  }
  if (expected !== 'bool' && meta.kind === 'bool') {
    throw new RangeError(`${field} 是开关字段，请用 toggleHealth`);
  }
  return meta;
}

/**
 * 非负整数，无法解释成数字时取 0。表单里的数字来自 input，可能是空串。
 *
 * @param {unknown} value 表单值
 * @param {number} [max] 上界（含），不传则无上界
 * @returns {number}
 */
function nonNegativeInt(value, max = Number.POSITIVE_INFINITY) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) return 0;
  return Math.min(max, Math.max(0, Math.round(num)));
}

/**
 * 当天的健康记录，缺则空对象。存档可能被手改，所以这里宽容。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object} 原始记录（未规范化）
 */
function rawHealthOf(save, key) {
  const health = save.days?.[key]?.health;
  return typeof health === 'object' && health !== null ? health : {};
}

/**
 * 十一个字段的规范化当前值：缺的补默认、越界收敛。页面直接绑这个对象。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object} 规范化后的 `healthLog`
 */
function healthLog(save, key) {
  const raw = rawHealthOf(save, key);
  const log = {};

  for (const [field, meta] of Object.entries(FIELDS)) {
    if (meta.kind === 'bool') {
      log[field] = raw[field] === true;
    } else if (meta.kind === 'count') {
      log[field] = nonNegativeInt(raw[field], meta.max);
    } else {
      // pick：不在白名单里就当没选（空串），不静默改成第一个 ——
      // 「随手落一个心情」比「还没选」更容易被家长误读
      log[field] = meta.values.includes(raw[field]) ? raw[field] : '';
    }
  }

  return log;
}

/**
 * 某个字段对应的任务今天打过卡没有。判据是 `checks`（`HABIT` 区的不变式：
 * 键存在即已打卡），不是 `health` 里那个布尔 —— 记录与打卡状态只能有一个真相。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @returns {boolean}
 */
function isChecked(save, key, habitId) {
  const checks = save.days?.[key]?.checks;
  return typeof checks === 'object' && checks !== null && habitId in checks;
}

/**
 * 洗澡的本周计数。任务被家长删掉时返回 `null`，标题上就不显示计数 ——
 * 渲染宽容（AGENTS.md 第 5 节第 6 条），抛错等于白屏。
 *
 * 数的是 `checks`，不是 `health.bath`。线上两个都数是历史遗留，
 * 本仓库从第一天起 `checks` 就是「做没做」的唯一真相。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳
 * @returns {{ done: number, target: number } | null}
 */
function bathWeekOf(save, now) {
  const habits = Array.isArray(save.habits) ? save.habits : [];
  const bath = habits.find((item) => item.id === BATH_HABIT_ID);
  if (!bath) return null;

  const done = weekKeys(now).filter((key) => isChecked(save, key, BATH_HABIT_ID)).length;
  return { done, target: nonNegativeInt(bath.weeklyTarget) };
}

/**
 * 健康页的唯一读取入口。页面不写那三个 emoji、不写糖数上限、不写周目标的 3。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {number} now 毫秒时间戳，由页面层传入（周计数要往前走一周）
 * @returns {{ log: object, bathWeek: object | null, poopIcons: object[], sugarMax: number }}
 * @throws {TypeError} `now` 非有限数
 */
export function healthState(save, key, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const log = healthLog(save, key);

  return {
    log,
    bathWeek: bathWeekOf(save, now),
    // 与 petState().types 同一个形状：页面不自己判断哪个被选中
    poopIcons: POOP_ICONS.map((icon) => ({ icon, current: log.poopIcon === icon })),
    sugarMax: SUGAR_MAX,
  };
}

/**
 * 把一份新的健康记录写回存档。
 *
 * **从 `awarded` 里取 `day`**，不是从入参 `save` 里取：发放往 `days[key]` 上追加的
 * `checks` 与 `ledger` 一定在 `awarded` 里，所以不存在被旧对象覆盖的可能。
 * 顺序与 `completeLearning` 相反（那里先写记录再打卡），而这里靠「读的是上一步的输出」
 * 让顺序不再要紧（`HEALTH-20` 是回归防线，不是唯一的保障）。
 *
 * @param {object} awarded 发放之后的存档
 * @param {string} key 日期键
 * @param {object} patch 要合并进健康记录的字段
 * @returns {object} 新存档
 */
function writeHealth(awarded, key, patch) {
  const day = awarded.days?.[key] ?? {};
  return {
    ...awarded,
    days: {
      ...awarded.days,
      [key]: { ...day, health: { ...rawHealthOf(awarded, key), ...patch } },
    },
  };
}

/**
 * 一个连着任务的开关转向真 / 假时的发放与退回。没有 `habitId` 的字段原样返回。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id，空串表示不发放
 * @param {boolean} on 转向真还是假
 * @param {number} now 毫秒时间戳
 * @returns {object} 发放 / 退回后的存档
 * @throws {RangeError} `habitId` 在 `habits` 里找不到
 */
function settle(save, key, habitId, on, now) {
  if (!habitId) return save;
  // 提交路径严格：找不到任务抛 RangeError（与 findHabit 同一条策略）
  findHabit(save, habitId);
  return on
    ? checkAwardAndGrow(save, key, habitId, now)
    : uncheckAndRefund(save, key, habitId, now);
}

/**
 * 反转一个开关字段，连着任务的顺带发放 / 退回。
 *
 * **不收 `value`**：反转由这里自己算。让页面传 `!当前值` 等于把「开关是什么语义」
 * 搬进页面，而且发放与退回的配对就少了一个统一的把关处 —— 配对错一次就是
 * 「星星涨了但取消不退」。
 *
 * 健康打卡的经验是 `checkAwardAndGrow` 的默认值 5（与自律打卡同价，线上走的是
 * 同一个 `ko`），所以不传第五参数，本区也没有新的经验常量（`HEALTH-03`）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} field 布尔字段名
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档
 * @throws {RangeError} 未登记的字段、取值字段、或对应任务不存在
 * @throws {TypeError} `now` 非有限数
 */
export function toggleHealth(save, key, field, now) {
  const meta = fieldOf(field, 'bool');
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const on = rawHealthOf(save, key)[field] !== true;
  return writeHealth(settle(save, key, meta.habitId, on, now), key, { [field]: on });
}

/**
 * 写一个取值字段（糖数 / 便便心情 / 运动分钟数），必要时连带打开它蕴含的开关。
 *
 * **写入与当前相同的值、且蕴含的开关已经打开时原样返回**（`HEALTH-15`）：
 * 数字输入框每敲一下就触发一次，没有这条同一性，页面每个按键都会写一次 storage。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} field 取值字段名
 * @param {unknown} value 新值（数字字段收字符串，`poopIcon` 必须在白名单里）
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；无事发生时返回入参本身
 * @throws {RangeError} 未登记的字段、布尔字段、或 `poopIcon` 不在三个 emoji 里
 * @throws {TypeError} `now` 非有限数
 */
export function setHealth(save, key, field, value, now) {
  const meta = fieldOf(field, 'value');
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  let next;
  if (meta.kind === 'count') {
    next = nonNegativeInt(value, meta.max);
  } else {
    // pick 的越界是编程错误：三个 emoji 是 healthState 渲染出来的，
    // 页面不可能传出第四个（HEALTH-12）
    if (!meta.values.includes(value)) {
      throw new RangeError(`${field} 只能是 ${meta.values.join(' / ')} 之一，收到 ${value}`);
    }
    next = value;
  }

  const log = healthLog(save, key);
  const turnsOn = meta.turnsOn ?? '';
  // 蕴含只打开、不关闭：exercise 关掉时不清 exerciseMinutes（线上如此）——
  // 清掉等于「手滑关一下就丢数据」，留着的代价只是一个不显示的字段
  const opening = turnsOn !== '' && log[turnsOn] !== true;
  if (log[field] === next && !opening) return save;

  const patch = opening ? { [field]: next, [turnsOn]: true } : { [field]: next };
  const awarded = opening ? settle(save, key, FIELDS[turnsOn].habitId, true, now) : save;
  return writeHealth(awarded, key, patch);
}
