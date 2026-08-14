/**
 * 家长端：PIN 验证、设置写入、存档导出。
 *
 * 规格来源：docs/features/parent/doc.md（`PARENT` 区）
 *
 * 依赖方向 parent.js → save.js，**只有这一条**。不 import 任何 `data/`：
 * `summary` 数的都是存档上一层就能数出来的东西（`days` 的键数、三个学习子键的条数、
 * 两种货币），家长端不需要知道题库里有 30 道题。
 *
 * **也不 import importOnline.js**（tasks.md 的头注写着）：导入是
 * `importOnlineSave` 自己的事，两者没有共同的判断，页面各调一个即可。
 *
 * 与线上的三处偏离（理由都在 doc.md）：
 * 1. PIN 输错**连错 5 次冷却 60 秒** —— 线上无限次重试，而 4 位数字只有一万种组合，
 *    威胁模型里真实的对手是 5 岁孩子拿着这台手机穷举。
 * 2. 写设置**只有 `saveSettings` 一个入口**，非 4 位数字的 PIN 抛 `RangeError` ——
 *    线上有两个入口，规则页那个边打边写存档，删到一位就落盘（doc.md 缺陷 3）。
 * 3. 导出的是**本仓库存档原文**，不做反向迁移（线上读 `parentSettings` 那套字段名）。
 *
 * PIN **存明文**，与线上一致：能读到 storage 的人能读到里面任何东西，
 * 哈希只防孩子而孩子看不到 storage。所以忘了 PIN 只能清空数据
 * （`docs/vision.md`「待确认」名单里那条已在本轮拍成定论）。
 */

import { defaultSave } from './save.js';

/** PIN 的唯一合法形状：恰好 4 位数字，明文 */
const PIN_RE = /^\d{4}$/;

/**
 * 连错几次进冷却。与 `save.js` 的 `PIN_MAX_FAILS` 是同一个 5 ——
 * 那边夹存档（不让脏数据撑大数字），这边做判定（第几次该锁）。
 */
const MAX_FAILS = 5;

/**
 * 冷却时长。60 秒是「把一直点变成点不动」的最小代价：
 * 对穷举的孩子是一道墙，对家长几乎无成本（自己的 PIN 不会连错五次）。
 */
const LOCK_MS = 60000;

/** 每日目标的范围。上界与 `save.js` 的 `DAILY_GOAL_MAX` 是同一个 12 */
const DAILY_GOAL_MIN = 1;
const DAILY_GOAL_MAX = 12;

/**
 * `saveSettings` 的白名单。家长端**不是万能写入口** —— 传 `star` 进来抛 `RangeError`，
 * 因为货币只能靠打卡产出（`docs/vision.md`「明确不做」）。
 */
const SETTING_FIELDS = ['childName', 'pin', 'dailyGoal', 'note'];

/**
 * 存档里的 `parent` 子键，缺失或坏结构时给默认值。
 *
 * 收敛已经由 `normalizeSave` 做过（`SAVE-19`），但存档也可能是调用方手拼的
 * （测试、导入前的预览），所以读的时候仍然夹一次 —— 夹的代价是常数
 * （与 `roundsOf` / `poemsOf` 同一条）。
 *
 * @param {object} save 存档
 * @returns {{ pin: string, dailyGoal: number, note: string, pinFails: number, pinLockedUntil: number }}
 */
function parentOf(save) {
  const base = defaultSave().parent;
  const raw = save?.parent;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base;

  return {
    pin: typeof raw.pin === 'string' && raw.pin !== '' ? raw.pin : base.pin,
    dailyGoal: clampInt(raw.dailyGoal, DAILY_GOAL_MIN, DAILY_GOAL_MAX, base.dailyGoal),
    note: typeof raw.note === 'string' ? raw.note : base.note,
    pinFails: clampInt(raw.pinFails, 0, MAX_FAILS, base.pinFails),
    pinLockedUntil: clampInt(raw.pinLockedUntil, 0, Number.POSITIVE_INFINITY, base.pinLockedUntil),
  };
}

/**
 * 收敛成 [min, max] 内的整数，非数值取 fallback（与 `save.js` 的同名 helper 同形状）。
 *
 * @param {unknown} value 待收敛的值
 * @param {number} min 下界（含）
 * @param {number} max 上界（含）
 * @param {number} fallback 无法解释成数值时的取值
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 数一数这台机器上有多少数据。**只数存档上一层就能数出来的东西**，
 * 不 import 任何 `data/` —— 家长要的是「有没有数据」，不是「学完了百分之几」。
 *
 * 它同时是**导入前后的对照物**：粘贴一份 JSON 之后，覆盖前那个确认弹窗显示的
 * 「X 天记录 · Y 字 · Z 首 · N 道题」就是这里数出来的
 * —— 光看 JSON 的前 80 个字符看不出粘对了没有。
 * 页面拿它的方式是 `parentState(待导入的存档, now).summary`，
 * 所以本函数**不导出** —— `parent.js` 对外仍是 doc.md 说的四个函数。
 *
 * @param {object} save 存档
 * @returns {{ days: number, chars: number, poems: number, rounds: number, star: number, medal: number }}
 */
function saveSummary(save) {
  const days = save?.days;
  const progress = save?.learningProgress;
  const currency = save?.currency;

  return {
    days: countKeys(days),
    chars: countKeys(progress?.literacy?.chars),
    poems: countKeys(progress?.guoxue?.poems),
    rounds: countKeys(progress?.math?.rounds),
    star: clampInt(currency?.star, 0, Number.POSITIVE_INFINITY, 0),
    medal: clampInt(currency?.medal, 0, Number.POSITIVE_INFINITY, 0),
  };
}

/**
 * 普通对象的键数，非对象给 0。
 *
 * @param {unknown} value 待数的值
 * @returns {number}
 */
function countKeys(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 0;
  return Object.keys(value).length;
}

/**
 * 家长端的唯一读取入口。**不抛错**（渲染路径宽容）：脏 `pinFails` / `pinLockedUntil`
 * 读的时候收敛（`PARENT-21`）、缺 `parent` 子键时给默认值。
 *
 * `now` 是**真的参数**（与 `mathState` 的那个不同）：`locked` 与 `lockedSeconds`
 * 都由它与 `pinLockedUntil` 现算，所以非有限数抛 `TypeError`（`PARENT-20`）——
 * 拿 `NaN` 算出来的 `locked` 是 `false`，那会静默解掉冷却。
 *
 * `lockedSeconds` **向上取整**：还剩 0.2 秒时显示「1 秒」而不是「0 秒」，
 * 因为显示 0 秒却还点不动比多等一秒更让人困惑。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {{ childName: string, childAvatar: string, pin: string, dailyGoal: number,
 *             note: string, locked: boolean, lockedSeconds: number, failsLeft: number,
 *             summary: object }}
 * @throws {TypeError} `now` 非有限数
 */
export function parentState(save, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const base = defaultSave();
  const parent = parentOf(save);
  const remain = parent.pinLockedUntil - now;
  const locked = remain > 0;

  return {
    childName:
      typeof save?.childName === 'string' && save.childName !== ''
        ? save.childName
        : base.childName,
    childAvatar:
      typeof save?.childAvatar === 'string' && save.childAvatar !== ''
        ? save.childAvatar
        : base.childAvatar,
    pin: parent.pin,
    dailyGoal: parent.dailyGoal,
    note: parent.note,
    locked,
    lockedSeconds: locked ? Math.ceil(remain / 1000) : 0,
    failsLeft: Math.max(0, MAX_FAILS - parent.pinFails),
    summary: saveSummary(save),
  };
}

/**
 * 验一次 PIN。**返回 `{ ok, save, reason }` 而不是抛错**：「输错密码」是正常的用户状态
 * （`AGENTS.md` 第 5 节第 6 条），与 `learningBlock` 返回原因码、
 * `petState().feedBlock` 同一套约定。`reason` 三取值：
 * `null` 对了 / `'wrong'` 错了 / `'locked'` 在冷却里（这次输入根本没验）。
 *
 * **它必须同时返回新存档**：验错要计数、验对要清零，两件都是落盘动作 ——
 * 本轮唯一一个既给判定又给存档的函数。
 *
 * 冷却中**不累加 `pinFails`、也不延长冷却**（`PARENT-06`）：那会让「冷却期间乱点」
 * 把 60 秒变成永久。所以那一支原样返回入参（对象同一性），页面不落盘。
 *
 * `input` 不是字符串时按「错了」算，不抛错（`PARENT-23`）：它来自输入框，什么都可能。
 *
 * @param {object} save 存档
 * @param {unknown} input 家长输入的 4 位数字
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {{ ok: boolean, save: object, reason: null | 'wrong' | 'locked' }}
 * @throws {TypeError} `now` 非有限数
 */
export function verifyPin(save, input, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const parent = parentOf(save);

  // 冷却中：这次输入根本不验，连正确的 PIN 也不放过（否则冷却形同虚设）
  if (parent.pinLockedUntil > now) {
    return { ok: false, save, reason: 'locked' };
  }

  if (typeof input === 'string' && input === parent.pin) {
    return {
      ok: true,
      save: { ...save, parent: { ...parent, pinFails: 0, pinLockedUntil: 0 } },
      reason: null,
    };
  }

  // 冷却到期后第一次输错从 1 数起：上一轮的 pinFails 已经在到期那刻失去意义，
  // 但清零发生在这里而不是读取时 —— 读取路径不该有副作用
  const fails = (parent.pinLockedUntil > 0 ? 0 : parent.pinFails) + 1;

  return {
    ok: false,
    save: {
      ...save,
      parent: {
        ...parent,
        pinFails: Math.min(MAX_FAILS, fails),
        pinLockedUntil: fails >= MAX_FAILS ? now + LOCK_MS : 0,
      },
    },
    reason: 'wrong',
  };
}

/**
 * 写家长设置。四个字段的**白名单**（`childName` / `pin` / `dailyGoal` / `note`），
 * 未登记的字段抛 `RangeError`（`PARENT-16`）—— 家长端不是万能写入口，
 * 货币与进度只能靠打卡产出。
 *
 * `pin` 非 4 位数字抛 `RangeError`（`PARENT-13`）：页面已按 4 位数字校验过，
 * 传进来只可能是编程错误 —— 这条把线上那个「删到一位就落盘」的第二入口彻底关掉。
 * 而 `childName` 全空白**回落 `'nono'`**（`PARENT-11`），不抛错：那是家长
 * 真的可能做的事（清空输入框再保存），属于宽容的一侧。
 *
 * 改 `pin` 时顺带**清零两个水位**（`PARENT-14`）：改了密码就不该还在冷却里。
 *
 * 无变化时**原样返回入参**（对象同一性，`PARENT-15`），页面 `if (next === this.save) return`。
 *
 * @param {object} save 存档
 * @param {object} patch 要改的字段，键必须在白名单里
 * @returns {object} 新存档，或入参本身
 * @throws {RangeError} 未登记的字段、`pin` 不是 4 位数字、`dailyGoal` 不是数值
 */
export function saveSettings(save, patch) {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new RangeError(`patch 必须是普通对象，收到 ${JSON.stringify(patch)}`);
  }

  for (const field of Object.keys(patch)) {
    if (!SETTING_FIELDS.includes(field)) {
      throw new RangeError(
        `${JSON.stringify(field)} 不是家长设置项，只能改 ${SETTING_FIELDS.join(' / ')}`,
      );
    }
  }

  const base = defaultSave();
  const parent = parentOf(save);
  const current = {
    childName:
      typeof save?.childName === 'string' && save.childName !== ''
        ? save.childName
        : base.childName,
    pin: parent.pin,
    dailyGoal: parent.dailyGoal,
    note: parent.note,
  };
  const next = { ...current };

  if ('childName' in patch) {
    const name = typeof patch.childName === 'string' ? patch.childName.trim() : '';
    next.childName = name === '' ? base.childName : name;
  }

  if ('pin' in patch) {
    if (typeof patch.pin !== 'string' || !PIN_RE.test(patch.pin)) {
      throw new RangeError(`pin 必须是 4 位数字的字符串，收到 ${JSON.stringify(patch.pin)}`);
    }
    next.pin = patch.pin;
  }

  if ('dailyGoal' in patch) {
    if (typeof patch.dailyGoal !== 'number' || !Number.isFinite(patch.dailyGoal)) {
      throw new RangeError(`dailyGoal 必须是有限数，收到 ${JSON.stringify(patch.dailyGoal)}`);
    }
    next.dailyGoal = Math.min(
      DAILY_GOAL_MAX,
      Math.max(DAILY_GOAL_MIN, Math.round(patch.dailyGoal)),
    );
  }

  if ('note' in patch) {
    next.note = typeof patch.note === 'string' ? patch.note.trim() : '';
  }

  const changed = SETTING_FIELDS.some((field) => next[field] !== current[field]);
  if (!changed) return save;

  const pinChanged = next.pin !== current.pin;

  return {
    ...save,
    childName: next.childName,
    parent: {
      ...parent,
      pin: next.pin,
      dailyGoal: next.dailyGoal,
      note: next.note,
      // 改了密码就不该还在冷却里（PARENT-14）；只改昵称时两个水位原样留着
      pinFails: pinChanged ? 0 : parent.pinFails,
      pinLockedUntil: pinChanged ? 0 : parent.pinLockedUntil,
    },
  };
}

/**
 * 存档 → 可粘贴的 JSON 字符串。缩进 2 空格，与线上同一形状
 * （线上 `JSON.stringify(state, null, 2)`）。
 *
 * 它在 `utils/` 而不是页面里，是因为「导出的是哪一份」是业务决定：
 * 导出的是**本仓库存档原文**，不是线上那 19 个顶层键的形状 ——
 * **不做反向迁移**（线上读 `parentSettings` / `tasks` / `dailyRecords` 那套字段名，
 * 写一个反向映射表要维护两份，而线上那份 PWA 不再演进）。
 * 本仓库的导出只用于备份与调试，理由写在 doc.md 的「范围外」。
 *
 * @param {object} save 存档
 * @returns {string} 带缩进的 JSON
 */
export function exportJson(save) {
  return JSON.stringify(save, null, 2);
}
