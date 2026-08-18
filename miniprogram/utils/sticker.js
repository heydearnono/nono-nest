/**
 * 贴纸：一个读、一个写。
 *
 * 规格来源：docs/features/sticker/doc.md（`STICKER` 区）
 *
 * 依赖方向 sticker.js → point.js → habit.js → dayKey.js → data/，无环。
 * **本模块不 import `dayKey.js`**：日期键是入参，本模块一次都不算日期
 * （`stickerState` 连 `now` 都不吃）。**也不 import `reward.js`**：勋章余额直接读
 * `save.currency.medal` —— `rewardState` 那份带着兑换卡与成就墙，需求不同
 * （与 `parentTasks.js` 不 import `habit.js` 同一条）。
 *
 * **抽贴纸是「货币只由 point.js 改」的第八个执行点**（打卡、取消、全勤、周奖励、
 * 兑换、成就、驳回退款七处已有）。勋章抽走 `postLedger`，所以「流水加起来等于余额」
 * 在本轮之后仍然成立 —— 线上 `--e.currency.medals` 一句就完了，不进流水。
 *
 * ## 随机源：不注入，用种子现算
 *
 * `utils/` 不读 `Math.random()`（`AGENTS.md` 第 3 节）。三个候选都摆过：
 * 页面传 `random()`（多一个参数、每条测试都要给假函数、还要拍板「传了坏函数怎么办」）、
 * 页面传一个 `nonce`（与下一条等价，只是把序号的来源换成页面）、
 * **种子现算**（种子吃日期键与已抽总次数）。选第三个，与 `math.js::shuffleSeed`
 * （miniprogram/utils/math.js:194）同一条先例。
 *
 * ## 代价：同一份存档、同一天、第 N 次抽必然是同一张
 *
 * 这在界面上**观测不到**：抽取是不可撤销的写入，抽完第 N 次就只能抽第 N+1 次，
 * 没有「回到抽之前再抽一次」这条路径。免费抽与勋章抽共享同一个序号，
 * 所以同一天同一个序号下两种来源给同一张 —— 同理观测不到（花什么与抽到什么是两件事，
 * 而序号只由抽过几次决定）。而它在测试里是白拿的好处：
 * **一条桩都不用打，直接断言落了哪张**。
 *
 * ## 与线上 `vo()`（.scratch/index-VUOSJfWA.js:270141）的三处写法差异
 *
 * 1. `Math.random()` 换成线性同余取**高位**（与 math.js:227 同一组参数）——
 *    模 2³² 的 LCG 低位周期极短。
 * 2. 浮点 `cursor` 换成**整数 `roll`**：线上连减 140 次浮点权重，
 *    最后一步可能因累积误差落到兜底分支上。
 * 3. 判 `roll < 0` 而不是 `cursor <= 0`：`roll` 从 `0` 起，第一条权重 55 的贴纸
 *    要吃掉 `0 ~ 54` 这 55 个值 —— 判 `<= 0` 会让它只吃掉 `0` 一个。
 *
 * 只从未拥有的里抽这一条**照搬**：前 140 次必不重复，「图鉴在长」不会被运气卡住。
 */

import { CATEGORY_LABEL, RARITY_LABEL, STICKERS } from '../data/stickers.js';
import { postLedger } from './point.js';

/**
 * 三档稀有度的抽取权重，数字抄线上 `_o`（.scratch/index-VUOSJfWA.js:270106）。
 *
 * **不进存档**：家长端不调概率（doc.md「范围外」）。满池上的实际分布是
 * 84/37/19 条 × 55/30/15 = 4620/1110/285，合计 6015 —— 76.8% / 18.5% / 4.7%。
 */
const RARITY_WEIGHT = { common: 55, uncommon: 30, rare: 15 };

/** 抽贴纸一次的勋章价，与「1 勋章抽」那个按钮上的数字是同一个 */
const MEDAL_COST = 1;

/** `source` 的两个取值。第三个值是编程错误，抛 `RangeError`（`STICKER-19`） */
const SOURCES = ['free', 'medal'];

/**
 * 收藏册，缺失或坏结构时给空对象。
 *
 * 元素的收敛由 `normalizeSave` 做过（`SAVE-25`：值都 >= 1、`0` 与负数的键已丢掉），
 * 这里只保证是个对象 —— 页面可能拿到手拼的存档（测试、导入中途），读取路径不抛错。
 *
 * @param {object} save 存档
 * @returns {Record<string, number>} 贴纸 id → 抽到过几次
 */
function collectionOf(save) {
  const collection = save.stickerCollection;
  return typeof collection === 'object' && collection !== null && !Array.isArray(collection)
    ? collection
    : {};
}

/**
 * 一张贴纸抽到过几次。**未登记的 id 在这里读不到** —— 调用方只遍历 `STICKERS`。
 *
 * @param {Record<string, number>} collection 收藏册
 * @param {string} id 贴纸 id
 * @returns {number} 0 = 没抽到过
 */
function countOf(collection, id) {
  const count = collection[id];
  return Number.isFinite(count) && count >= 1 ? count : 0;
}

/**
 * 已抽总次数：**只算登记过的 id**（与 `owned` 同一条 —— 未知 id 不参与任何读取）。
 *
 * 它是种子的第二个分量，也就是「这份存档抽到第几次了」。**不落新字段**：
 * 收藏册本身就记着每张抽到过几次，求和就是抽过几次 —— 再存一个计数器等于
 * 同一笔数据两个来源（与 `reward.js`「进度每次现算，不存」同一条）。
 *
 * @param {Record<string, number>} collection 收藏册
 * @returns {number} 非负整数
 */
function drawnTotal(collection) {
  return STICKERS.reduce((sum, sticker) => sum + countOf(collection, sticker.id), 0);
}

/**
 * 种子：逐字符累加的 32 位整数（FNV-1a），与 `math.js::shuffleSeed` 逐字同一份。
 *
 * 吃的是**日期键与已抽总次数**，所以「同一份存档同一天第 N 次抽」恒定 ——
 * 那条代价的来处就在这一行（头注释第二段）。
 *
 * @param {string} key 日期键
 * @param {number} drawn 已抽总次数
 * @returns {number} 非负 32 位整数
 */
function seedOf(key, drawn) {
  let seed = 2166136261;
  for (const char of `${key}|${drawn}`) {
    seed = (seed ^ char.codePointAt(0)) >>> 0;
    seed = (seed * 16777619) >>> 0;
  }
  return seed;
}

/**
 * 加权抽取：只从未拥有的里抽，抽空了才从全表抽（与线上 `vo()` 同）。
 *
 * `roll` 是 `0 ~ total-1` 的**整数**，从每条的权重里连减，减到负数就是它
 * —— 三处与线上的写法差异见头注释。末尾那个 `return` 只在 `pool` 为空时才可能走到，
 * 而 `pool` 至少是 140 条的全表，所以它是形式上的兜底。
 *
 * @param {Record<string, number>} collection 收藏册
 * @param {number} seed 种子
 * @returns {object} 一条贴纸定义
 */
function pick(collection, seed) {
  const unowned = STICKERS.filter((sticker) => countOf(collection, sticker.id) === 0);
  const pool = unowned.length > 0 ? unowned : STICKERS;
  const total = pool.reduce((sum, sticker) => sum + RARITY_WEIGHT[sticker.rarity], 0);

  const state = (seed * 1664525 + 1013904223) >>> 0;
  let roll = Math.floor((state / 4294967296) * total);

  for (const sticker of pool) {
    roll -= RARITY_WEIGHT[sticker.rarity];
    if (roll < 0) return sticker;
  }

  return pool[pool.length - 1];
}

/**
 * 图鉴的读取入口：140 格、收藏进度、七个类别筛选项、两个按钮的状态。
 *
 * **不吃 `now`**：要判断的只有「今天免费抽过没有」，而那是
 * `lastFreeStickerDate === key` 一个字符串比较（与 `parentTasks(save)` 同一条 ——
 * 不需要的参数不加，加了就会有人以为它在算什么与时刻有关的东西）。
 *
 * **不抛错**（渲染宽容）：收藏册是坏结构、`currency` 缺失都只影响数值。
 * `items` 每条带 `categoryLabel` / `rarityLabel`，**页面一个文案都不映射**。
 * **未登记的 id 在这里被忽略**（`STICKER-06`）：`items` 只从 `STICKERS` 生成，
 * `owned` 也只数登记过的 —— 收敛层留着脏 id 是为了不丢数据，读取侧不认它。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @returns {object} 页面直接绑的数据
 */
export function stickerState(save, key) {
  const collection = collectionOf(save);

  const items = STICKERS.map((sticker) => {
    const count = countOf(collection, sticker.id);
    return {
      ...sticker,
      owned: count > 0,
      count,
      categoryLabel: CATEGORY_LABEL[sticker.category],
      rarityLabel: RARITY_LABEL[sticker.rarity],
    };
  });

  const owned = items.filter((item) => item.owned).length;
  const total = STICKERS.length;
  const balance = save.currency?.medal ?? 0;

  return {
    items,
    owned,
    total,
    // 只会涨的一条线（docs/vision.md「什么算好」第 1 条）
    percent: Math.round((owned / total) * 100),
    categories: [
      { key: 'all', label: '全部', total, owned },
      ...Object.entries(CATEGORY_LABEL).map(([category, label]) => {
        const inCategory = items.filter((item) => item.category === category);
        return {
          key: category,
          label,
          total: inCategory.length,
          owned: inCategory.filter((item) => item.owned).length,
        };
      }),
    ],
    // 一个字符串比较就够，所以本函数不需要 now
    free: { used: save.lastFreeStickerDate === key },
    medal: { balance, ready: balance >= MEDAL_COST },
  };
}

/**
 * 抽一张贴纸：收藏册那个键 `+1`，`'medal'` 扣一枚勋章并写一条流水，
 * `'free'` 只把 `lastFreeStickerDate` 推到今天。
 *
 * 返回**四元组**，与 `verifyPin` 的 `{ ok, save, reason }` 同形：抽不动
 * （今天免费抽过了、勋章不够）是**正常用户状态**而不是非法入参，所以给原因码
 * 而不是抛错（`AGENTS.md` 第 5 节第 6 条），而页面还要知道抽到了哪一张才能弹揭示层。
 * 抽不动时 `save` 是**入参本身**（对象同一性，`STICKER-09` / `STICKER-12`）、
 * `sticker` 为 `null`，页面 `if (next === this.save) return` 就不落盘。
 *
 * `reason` 三取值：`null` / `'freeUsed'` / `'noMedal'`。**不是文案** ——
 * 页面照原因码选那句话（与 `coreWarn` 同一条）。
 *
 * 顺序是**先抽后扣**：要先知道抽到哪一张，流水的 `reason` 里才有名字。
 * 抽不动的两个分支在扣之前就 `return` 了入参，所以不存在「扣了勋章没抽到」的中间态。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（今天）
 * @param {'free' | 'medal'} source 免费抽还是花勋章抽
 * @param {number} now 毫秒时间戳
 * @returns {{ save: object, sticker: object | null, isNew: boolean, reason: string | null }}
 * @throws {RangeError} `source` 不是那两个取值
 * @throws {TypeError} `now` 不是有限数
 */
export function drawSticker(save, key, source, now) {
  if (!SOURCES.includes(source)) {
    throw new RangeError(`source 必须是 'free' 或 'medal'，收到 ${JSON.stringify(source)}`);
  }
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }

  const balance = save.currency?.medal ?? 0;
  if (source === 'free' && save.lastFreeStickerDate === key) {
    return { save, sticker: null, isNew: false, reason: 'freeUsed' };
  }
  if (source === 'medal' && balance < MEDAL_COST) {
    return { save, sticker: null, isNew: false, reason: 'noMedal' };
  }

  const collection = collectionOf(save);
  const sticker = pick(collection, seedOf(key, drawnTotal(collection)));
  const isNew = countOf(collection, sticker.id) === 0;

  let next = {
    ...save,
    stickerCollection: { ...collection, [sticker.id]: countOf(collection, sticker.id) + 1 },
  };

  if (source === 'free') {
    // 免费抽是一次纯粹的水位迁移：货币一分不动、流水一行不加（`STICKER-08`）
    next = { ...next, lastFreeStickerDate: key };
  } else {
    // 第八个 postLedger 执行点。reason 带贴纸名字 —— 家长在报告里能看见勋章花在哪儿了
    next = postLedger(
      next,
      key,
      'spend',
      { star: 0, gem: 0, petFood: 0, medal: MEDAL_COST },
      `抽贴纸：${sticker.name}`,
      now,
    );
  }

  return { save: next, sticker, isNew, reason: null };
}
