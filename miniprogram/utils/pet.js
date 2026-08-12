/**
 * 宠物：饱腹度衰减、喂食、陪玩、成长、形象。
 *
 * 规格来源：docs/features/pet/doc.md（`PET` / `FULLNESS` / `MOOD` 三个区）
 *
 * 依赖方向 pet.js → point.js → habit.js → data/，无环。
 * `checkAwardAndGrow` 是包在 `checkAndAward` **外面**的一层：升级是个 while 循环，
 * 塞进发放函数会让 POINT-01 的断言范围悄悄扩大到宠物等级
 * （见 docs/features/point/summary.md）。
 *
 * 与线上最大的偏差：**饱腹度会随时间衰减**。线上的 `satiety` 只升不降，
 * 于是宠物粮没有用途、「照顾一只小伙伴」这件事不成立。理由写在 doc.md 里。
 * 开心度**不衰减** —— 「你不陪我我就难过」是情绪绑架，与「温和，不惩罚」冲突。
 */

import { PET_TYPES } from '../data/petTypes.js';
import { checkAndAward } from './point.js';

/** 饱腹度每衰减 1 点所需的时长：6 小时。拍板值，理由见 doc.md 的 FULLNESS 规格表 */
const FULLNESS_DECAY_MS = 6 * 60 * 60 * 1000;

/** 饱腹度与开心度的上限（0-5 离散档位，线上原样） */
const PET_SCALE_MAX = 5;

/** 界面显示「饿饿」的阈值，与线上一致 */
const FULLNESS_LOW_AT = 2;

/** 一次喂食消耗的宠物粮点数。「1 份」是界面说法，存的是点数（见 glossary） */
const FEED_COST = 2;

/** 三个经验来源。线上：打卡 5、喂食 10、陪玩 5。学习打卡的 8 由调用方传给 checkAwardAndGrow */
const EXP_PER_CHECK = 5;
const EXP_PER_FEED = 10;
const EXP_PER_PLAY = 5;

/** 升级所需经验 = petLevel × 100（线上 `Dr(e) => e * 100`） */
function expToNext(petLevel) {
  return petLevel * 100;
}

/** 等级称号，线上五档文案原样沿用（包括读起来别扭的「可爱装饰」） */
function levelTitle(petLevel) {
  if (petLevel >= 5) return '魔法伙伴';
  if (petLevel >= 4) return '小书包伙伴';
  if (petLevel >= 3) return '可爱装饰';
  if (petLevel >= 2) return '成长中';
  return '幼年';
}

/**
 * 加经验并把等级升到位。升级循环只写这一处，`feed` / `play` / 打卡共用。
 *
 * @param {object} pet 宠物子对象
 * @param {number} gained 本次获得的经验
 * @returns {object} 新的宠物子对象
 */
function grow(pet, gained) {
  let petExp = pet.petExp + gained;
  let petLevel = pet.petLevel;

  while (petExp >= expToNext(petLevel)) {
    petExp -= expToNext(petLevel);
    petLevel += 1;
  }

  return { ...pet, petLevel, petExp };
}

/**
 * @param {unknown} now 待校验的时刻
 * @throws {TypeError} 非有限数时抛出
 */
function assertNow(now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
}

/**
 * 能不能喂：返回原因码而不是布尔值，页面按原因选提示语，不必自己再判断一次。
 *
 * 入参必须是**已结算**的存档 —— 存档里的 `fullness` 可能是几小时前的值。
 *
 * @param {object} save 已结算的存档
 * @returns {'full' | 'noFood' | null} 阻塞原因，`null` 表示可以喂
 */
function feedBlockOf(save) {
  if (save.pet.fullness >= PET_SCALE_MAX) return 'full';
  if (save.currency.petFood < FEED_COST) return 'noFood';
  return null;
}

/**
 * 能不能玩。
 *
 * @param {object} save 存档
 * @returns {'happy' | null} 阻塞原因，`null` 表示可以玩
 */
function playBlockOf(save) {
  return save.pet.mood >= PET_SCALE_MAX ? 'happy' : null;
}

/**
 * 找形象定义。存档里的 `type` 可能被写坏，所以这里**不抛错**、退回第一个形象的
 * emoji —— `petState` 是渲染路径，抛错等于白屏。`choosePet` 走另一条严格的路。
 *
 * @param {string} type 形象标识
 * @returns {object} 形象定义
 */
function typeOf(type) {
  return PET_TYPES.find((item) => item.type === type) ?? PET_TYPES[0];
}

/**
 * 饱腹度按 6 小时一步结算，并把基准时刻往前推**整数个步长**。
 *
 * 三个刻意的分支，每个对应一条规格：
 *   - `lastFedAt === 0`：还没有基准（首次进入 / 导入线上存档），不衰减，只立基准。
 *     否则 `now - 0` 是个巨大的差值，一进来就看到饿瘪的宠物（FULLNESS-01）。
 *   - 不足一步：原样返回。基准不动，余量留到下次（FULLNESS-03）。
 *   - `now` 早于基准（时钟回拨）：`elapsed` 为负，落进「不足一步」那支，
 *     不会倒着加饱腹度（FULLNESS-06）。
 *
 * 基准只推进 `步数 × 6h` 而不是直接置成 `now`：置成 `now` 会抹掉不足 6 小时的余量，
 * 每 5 小时打开一次小程序，宠物就永远不会饿（FULLNESS-04）。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；没有衰减发生时返回入参本身
 */
export function settleFullness(save, now) {
  assertNow(now);

  const pet = save.pet;
  if (pet.lastFedAt === 0) {
    return { ...save, pet: { ...pet, lastFedAt: now } };
  }

  const steps = Math.floor((now - pet.lastFedAt) / FULLNESS_DECAY_MS);
  if (steps <= 0) return save;

  return {
    ...save,
    pet: {
      ...pet,
      fullness: Math.max(0, pet.fullness - steps),
      lastFedAt: pet.lastFedAt + steps * FULLNESS_DECAY_MS,
    },
  };
}

/**
 * 宠物页的唯一读取入口。所有阈值判断（该不该显示「饿饿」、按钮该不该灰）
 * 都在这里给出结论，页面里不写阈值（AGENTS.md 第 3 节）。
 *
 * 读到的 `fullness` 是**结算后**的当前值，不是存档里那个可能过期的数。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 宠物状态
 */
export function petState(save, now) {
  const settled = settleFullness(save, now);
  const pet = settled.pet;
  const kind = typeOf(pet.type);

  return {
    type: pet.type,
    name: pet.name,
    emoji: kind.emoji,
    petLevel: pet.petLevel,
    levelTitle: levelTitle(pet.petLevel),
    petExp: pet.petExp,
    expToNext: expToNext(pet.petLevel),
    // 经验条的宽度百分比。页面里不写公式（AGENTS.md 第 3 节），
    // 而且 WXML 的表达式不支持 Math.round
    expPercent: Math.round((pet.petExp / expToNext(pet.petLevel)) * 100),
    fullness: pet.fullness,
    mood: pet.mood,
    // fullnessLow 而非 hungry：hungry 是 glossary 的禁用词，方向与 fullness 相反
    fullnessLow: pet.fullness <= FULLNESS_LOW_AT,
    petFood: settled.currency.petFood,
    feedBlock: feedBlockOf(settled),
    playBlock: playBlockOf(settled),
    // 形象选择行也从这里出：页面跨过 utils 直接 import data/ 会绕开
    // pages → utils → data 这条链（AGENTS.md 第 3 节）
    types: PET_TYPES.map((item) => ({
      type: item.type,
      displayName: item.displayName,
      emoji: item.emoji,
      current: item.type === pet.type,
    })),
  };
}

/**
 * 喂食：扣 2 点宠物粮、饱腹度 +1、经验 +10，并把基准时刻立成此刻。
 *
 * 饱了或粮不够时**原样返回**，不抛错 —— 那是正常的用户状态，不是编程错误，
 * 由页面按 `petState().feedBlock` 提示（AGENTS.md 第 5 节第 6 条）。
 *
 * 先结算再判断：存档里的 `fullness` 可能是几小时前的值，
 * 「20 小时没喂、存档里写着 3」实际已经是 0，此时应该能喂（PET-05）。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；喂不了时返回入参本身
 */
export function feed(save, now) {
  assertNow(now);

  const settled = settleFullness(save, now);
  if (feedBlockOf(settled)) return save;

  const fed = grow(settled.pet, EXP_PER_FEED);

  return {
    ...settled,
    currency: { ...settled.currency, petFood: settled.currency.petFood - FEED_COST },
    pet: {
      ...fed,
      fullness: Math.min(PET_SCALE_MAX, fed.fullness + 1),
      // 喂饱了，衰减重新从此刻起算
      lastFedAt: now,
    },
  };
}

/**
 * 陪玩：开心度 +1、经验 +5。
 *
 * 已经最开心时原样返回，**经验也不涨**（线上如此：`if (!已满) { 开心 +1; 经验 +5 }`）。
 * 这与打卡刻意不一致 —— 打卡时开心度满了经验照涨，因为那份经验是给
 * 「完成了一件事」的，不是给「宠物变开心」的（MOOD-03 与 MOOD-04 各钉一条）。
 *
 * 不碰饱腹度，也不结算它：陪玩与吃饭无关，把结算塞进来会让「玩一下」
 * 顺带改掉饱腹度，断言范围无谓地变大。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳，由页面层传入（保持四个动作签名一致）
 * @returns {object} 新存档；玩不了时返回入参本身
 */
export function play(save, now) {
  assertNow(now);
  if (playBlockOf(save)) return save;

  const played = grow(save.pet, EXP_PER_PLAY);

  return { ...save, pet: { ...played, mood: Math.min(PET_SCALE_MAX, played.mood + 1) } };
}

/**
 * 换形象。名字跟着形象走 —— 换形象等于换一只小伙伴。
 *
 * 与 `petState` 的宽容相反，这里对未登记的 `type` **抛错**：
 * 形象只可能来自 `PET_TYPES` 渲染出的按钮，传别的值是编程错误。
 *
 * @param {object} save 存档
 * @param {string} type 形象标识
 * @returns {object} 新存档
 * @throws {RangeError} `type` 不在 `PET_TYPES` 里
 */
export function choosePet(save, type) {
  const kind = PET_TYPES.find((item) => item.type === type);
  if (!kind) {
    throw new RangeError(`宠物形象 ${JSON.stringify(type)} 不在 PET_TYPES 里`);
  }

  return { ...save, pet: { ...save.pet, type: kind.type, name: kind.name } };
}

/**
 * 打卡：发放货币与流水（`POINT` 区），再涨经验与开心度。
 *
 * 幂等靠对象同一性 —— `checkAndAward` 幂等时返回入参本身，
 * 所以 `awarded === save` 就是「这次没有新打卡」的可靠信号，
 * 不必再问一遍 `isChecked`（与 `POINT` 区同一条约定）。
 *
 * **取消打卡没有对应的外层函数**：撤回只退货币（`uncheckAndRefund`），
 * 不收回经验、不降开心度 —— 与线上一致，也是「温和，不惩罚」的直接推论。
 *
 * `gainedExp` 由调用方给：自律打卡 5（默认值），学习打卡 8。
 * 这里**不按 `habitId` 分支** —— 那会让 pet.js 反向依赖 data/defaultHabits.js
 * （见 docs/features/learning/doc.md 的 LEARN-08）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} habitId 任务 id
 * @param {number} now 毫秒时间戳，由页面层传入
 * @param {number} [gainedExp] 本次打卡产出的经验，默认自律打卡的 5
 * @returns {object} 新存档；已打过卡时返回入参本身
 */
export function checkAwardAndGrow(save, key, habitId, now, gainedExp = EXP_PER_CHECK) {
  const awarded = checkAndAward(save, key, habitId, now);
  if (awarded === save) return save;

  const grown = grow(awarded.pet, gainedExp);

  return { ...awarded, pet: { ...grown, mood: Math.min(PET_SCALE_MAX, grown.mood + 1) } };
}
