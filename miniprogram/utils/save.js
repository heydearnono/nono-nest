/**
 * 存档：默认值与补齐。
 *
 * 规格来源：docs/features/storage/doc.md（`SAVE` 区）
 *
 * `normalizeSave` **不抛错**。存档来自 storage，可能被手改、也可能被旧版本写坏；
 * 读失败就白屏，违反 docs/vision.md「什么算好」第 2 条（不清零、不惩罚），
 * 所以一律收敛到合法值。这与 utils/ 里其它纯函数对非法入参抛错的约定不同，
 * 是刻意的例外，理由写在 doc.md 里。
 */

/** 饱腹度与开心度的取值范围（线上原样，0-5 离散档位） */
const PET_SCALE_MIN = 0;
const PET_SCALE_MAX = 5;

/**
 * 收敛成 [min, max] 区间内的整数。非数值、NaN、Infinity 一律取 fallback。
 *
 * @param {unknown} value 待收敛的值
 * @param {number} min 下界（含）
 * @param {number} max 上界（含），无上界时传 Number.POSITIVE_INFINITY
 * @param {number} fallback 无法解释成数值时的取值
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 非空字符串，否则取 fallback。
 *
 * @param {unknown} value 待收敛的值
 * @param {string} fallback 默认值
 * @param {boolean} [allowEmpty] 是否允许空串（备注类字段允许）
 * @returns {string}
 */
function str(value, fallback, allowEmpty = false) {
  if (typeof value !== 'string') return fallback;
  if (!allowEmpty && value === '') return fallback;
  return value;
}

/**
 * 只在真的是数组时保留，否则给一个新的空数组。
 *
 * @param {unknown} value 待收敛的值
 * @returns {unknown[]}
 */
function arr(value) {
  return Array.isArray(value) ? value.slice() : [];
}

/**
 * 普通对象（排除 null 与数组）。
 *
 * @param {unknown} value 待判断的值
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 存档的默认值。每次调用返回**新对象**，调用方可以随意改而不污染其它调用方。
 *
 * @returns {object} 一份全新的默认存档
 */
export function defaultSave() {
  return {
    version: 1,
    childName: 'nono',
    childAvatar: '👧',
    currency: { star: 0, gem: 0, petFood: 0, medal: 0 },
    pet: {
      type: 'unicorn',
      name: '彩虹',
      petLevel: 1,
      petExp: 0,
      fullness: 3,
      mood: 4,
      // 饱腹度衰减的基准时刻。0 = 还没有基准，首次结算时立成当前时刻，
      // 否则 now - 0 是个巨大的差值，一进来就看到饿瘪的宠物（FULLNESS-01）
      lastFedAt: 0,
    },
    habits: [],
    days: {},
    redemptions: [],
    achievements: [],
    parent: { pin: '1234', dailyGoal: 6, note: '' },
    soundEnabled: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * 把任意输入补齐成一份合法存档：缺字段取默认值，越界值收敛，未知顶层字段丢弃。
 *
 * @param {unknown} raw storage 里读到的原始值，可能是 undefined / 脏数据
 * @returns {object} 合法存档
 */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!isPlainObject(raw)) return base;

  const rawCurrency = isPlainObject(raw.currency) ? raw.currency : {};
  const rawPet = isPlainObject(raw.pet) ? raw.pet : {};
  const rawParent = isPlainObject(raw.parent) ? raw.parent : {};
  const noMax = Number.POSITIVE_INFINITY;

  return {
    version: 1,
    childName: str(raw.childName, base.childName),
    childAvatar: str(raw.childAvatar, base.childAvatar),
    currency: {
      star: clampInt(rawCurrency.star, 0, noMax, base.currency.star),
      gem: clampInt(rawCurrency.gem, 0, noMax, base.currency.gem),
      petFood: clampInt(rawCurrency.petFood, 0, noMax, base.currency.petFood),
      medal: clampInt(rawCurrency.medal, 0, noMax, base.currency.medal),
    },
    pet: {
      type: str(rawPet.type, base.pet.type),
      name: str(rawPet.name, base.pet.name),
      petLevel: clampInt(rawPet.petLevel, 1, noMax, base.pet.petLevel),
      petExp: clampInt(rawPet.petExp, 0, noMax, base.pet.petExp),
      fullness: clampInt(rawPet.fullness, PET_SCALE_MIN, PET_SCALE_MAX, base.pet.fullness),
      mood: clampInt(rawPet.mood, PET_SCALE_MIN, PET_SCALE_MAX, base.pet.mood),
      lastFedAt: clampInt(rawPet.lastFedAt, 0, noMax, base.pet.lastFedAt),
    },
    habits: arr(raw.habits),
    // days 的内部结构由各 feature 自己定义，本层只保证原样存、原样取
    days: isPlainObject(raw.days) ? { ...raw.days } : {},
    redemptions: arr(raw.redemptions),
    achievements: arr(raw.achievements),
    parent: {
      pin: str(rawParent.pin, base.parent.pin),
      dailyGoal: clampInt(rawParent.dailyGoal, 1, noMax, base.parent.dailyGoal),
      note: str(rawParent.note, base.parent.note, true),
    },
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : base.soundEnabled,
    createdAt: clampInt(raw.createdAt, 0, noMax, base.createdAt),
    updatedAt: clampInt(raw.updatedAt, 0, noMax, base.updatedAt),
  };
}
