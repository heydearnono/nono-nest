import { describe, expect, it } from 'vitest';

import { STICKERS } from '../miniprogram/data/stickers.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';
import { drawSticker, stickerState } from '../miniprogram/utils/sticker.js';

// 规格来源：docs/features/sticker/doc.md（`STICKER` 区）
//
// **一条桩都不打。** 种子只吃日期键与已抽总次数（`utils/sticker.js` 头注释），
// 所以「抽到哪一张」是确定的 —— 直接断言落了什么，不需要替换随机源。
// 但**具体抽到哪一张不写进断言**（那会把种子实现钉死），只断言不变式：
// 是不是新的、收藏册多了几个键、货币与流水动了没有。

const DAY = '2026-08-17';
const NEXT_DAY = '2026-08-18';
const NOW = new Date(2026, 7, 17, 12, 0, 0, 0).getTime();

/** 给存档一个勋章余额 */
function withMedal(save, medal) {
  return { ...save, currency: { ...save.currency, medal } };
}

/** 直接把某几张贴纸塞进收藏册（不走抽取，本函数测的是读取与池子） */
function withCollection(save, collection) {
  return { ...save, stickerCollection: collection };
}

/** 前 n 张各拥有一次 */
function ownFirst(n) {
  const collection = {};
  for (const sticker of STICKERS.slice(0, n)) collection[sticker.id] = 1;
  return collection;
}

/** 取图鉴里某一条 */
function row(items, id) {
  return items.find((item) => item.id === id);
}

describe('图鉴与两个按钮的状态（STICKER）', () => {
  it('[STICKER-01] 空存档：140 格全未拥有，进度 0', () => {
    const state = stickerState(defaultSave(), DAY);

    expect(state.total).toBe(140);
    expect(state.owned).toBe(0);
    expect(state.percent).toBe(0);
    expect(state.items).toHaveLength(140);
    expect(state.items[0].id).toBe('st-000-小狗狗');
    expect(state.items[139].id).toBe('st-139-彗星啦');
    expect(state.items.every((item) => item.owned === false)).toBe(true);
    expect(state.items.every((item) => item.count === 0)).toBe(true);
  });

  it('[STICKER-02] categories 七项：all 加六类，total 按段序 32/24/22/24/18/20', () => {
    const state = stickerState(defaultSave(), DAY);

    expect(state.categories.map((item) => item.key)).toEqual([
      'all',
      'animal',
      'food',
      'nature',
      'cute',
      'star',
      'fantasy',
    ]);
    expect(state.categories.map((item) => item.total)).toEqual([140, 32, 24, 22, 24, 18, 20]);
    expect(state.categories.map((item) => item.label)).toEqual([
      '全部',
      '动物',
      '美食',
      '自然',
      '可爱',
      '星星',
      '奇幻',
    ]);
    // 六类的 total 加起来正好是 140 —— 每张贴纸恰好属于一类
    const six = state.categories.slice(1).reduce((sum, item) => sum + item.total, 0);
    expect(six).toBe(140);
    expect(state.categories.every((item) => item.owned === 0)).toBe(true);
  });

  it('[STICKER-03] 拥有两张：owned 2、percent 1，count 只在拥有的那条上不为 0', () => {
    const save = withCollection(defaultSave(), { 'st-000-小狗狗': 3, 'st-018-独角兽': 1 });
    const state = stickerState(save, DAY);

    expect(state.owned).toBe(2);
    expect(state.percent).toBe(Math.round((2 / 140) * 100));
    expect(state.percent).toBe(1);
    expect(row(state.items, 'st-000-小狗狗')).toMatchObject({ owned: true, count: 3 });
    expect(row(state.items, 'st-018-独角兽')).toMatchObject({ owned: true, count: 1 });
    expect(row(state.items, 'st-001-小猫咪')).toMatchObject({ owned: false, count: 0 });
    // 六类里 animal 那一项跟着涨（两张都是 animal）
    const animal = state.categories.find((item) => item.key === 'animal');
    expect(animal).toMatchObject({ total: 32, owned: 2 });
  });

  it('[STICKER-04] 每条带 categoryLabel 与 rarityLabel —— 页面不映射文案', () => {
    const state = stickerState(defaultSave(), DAY);

    expect(row(state.items, 'st-000-小狗狗')).toMatchObject({
      categoryLabel: '动物',
      rarityLabel: '普通',
    });
    // uncommon 的中文是「稀有」、rare 才是「超稀有」—— 线上就是这么错位的，照搬不改
    expect(row(state.items, 'st-006-小老虎').rarityLabel).toBe('稀有');
    expect(row(state.items, 'st-018-独角兽').rarityLabel).toBe('超稀有');
    expect(row(state.items, 'st-032-红苹果').categoryLabel).toBe('美食');
    expect(row(state.items, 'st-139-彗星啦').categoryLabel).toBe('奇幻');
    // 140 条一条都不缺标签
    expect(state.items.every((item) => item.categoryLabel && item.rarityLabel)).toBe(true);
  });

  it('[STICKER-05] free.used 是一个字符串比较：今天 / 别的一天 / 空串', () => {
    const base = defaultSave();

    expect(stickerState({ ...base, lastFreeStickerDate: DAY }, DAY).free.used).toBe(true);
    expect(stickerState({ ...base, lastFreeStickerDate: NEXT_DAY }, DAY).free.used).toBe(false);
    expect(stickerState({ ...base, lastFreeStickerDate: '' }, DAY).free.used).toBe(false);
  });

  it('[STICKER-06] 未登记的 id 不计入 owned、也不出现在图鉴上', () => {
    const save = withCollection(defaultSave(), { zzz: 2, 'st-000-小狗狗': 1 });
    const state = stickerState(save, DAY);

    // SAVE-25 断言脏 id 留在存档里，本条断言它不出现在图鉴上 —— 两条各一层
    expect(save.stickerCollection.zzz).toBe(2);
    expect(state.owned).toBe(1);
    expect(state.items).toHaveLength(140);
    expect(state.items.some((item) => item.id === 'zzz')).toBe(false);
    expect(state.categories[0].owned).toBe(1);
  });

  it('[STICKER-07] medal.ready 是 balance >= 1', () => {
    const base = defaultSave();

    expect(stickerState(withMedal(base, 0), DAY).medal).toEqual({ balance: 0, ready: false });
    expect(stickerState(withMedal(base, 1), DAY).medal).toEqual({ balance: 1, ready: true });
    expect(stickerState(withMedal(base, 7), DAY).medal).toEqual({ balance: 7, ready: true });
  });
});

describe('抽取（STICKER）', () => {
  it('[STICKER-08] 免费抽：收藏册多一个键，货币四个数一个都没变、流水一行都没加', () => {
    const save = defaultSave();
    const out = drawSticker(save, DAY, 'free', NOW);

    expect(out.reason).toBe(null);
    expect(out.isNew).toBe(true);
    expect(out.sticker).not.toBe(null);
    expect(Object.keys(out.save.stickerCollection)).toHaveLength(1);
    expect(out.save.stickerCollection[out.sticker.id]).toBe(1);
    expect(out.save.lastFreeStickerDate).toBe(DAY);
    // 与 STICKER-11 成对：本条挡「免费抽也扣了勋章」
    expect(out.save.currency).toEqual({ star: 0, gem: 0, petFood: 0, medal: 0 });
    expect(ledgerOf(out.save, DAY)).toEqual([]);
  });

  it('[STICKER-09] 同一天再免费抽：原样返回入参，reason 为 freeUsed', () => {
    const first = drawSticker(defaultSave(), DAY, 'free', NOW).save;
    const out = drawSticker(first, DAY, 'free', NOW + 1000);

    expect(out.save).toBe(first); // 对象同一性 —— 页面 if (next === this.save) return 就不落盘
    expect(out.sticker).toBe(null);
    expect(out.isNew).toBe(false);
    expect(out.reason).toBe('freeUsed');
    expect(out.save.lastFreeStickerDate).toBe(DAY);
    expect(Object.keys(out.save.stickerCollection)).toHaveLength(1);
  });

  it('[STICKER-10] 第二天的免费抽又能抽了，水位推到第二天', () => {
    const first = drawSticker(defaultSave(), DAY, 'free', NOW).save;
    const out = drawSticker(first, NEXT_DAY, 'free', NOW + 86400000);

    expect(out.reason).toBe(null);
    expect(out.save.lastFreeStickerDate).toBe(NEXT_DAY);
    expect(ledgerOf(out.save, NEXT_DAY)).toEqual([]);
  });

  it('[STICKER-11] 勋章抽：勋章 3 变 2，且当天流水多一行、reason 带贴纸名字', () => {
    const save = withMedal(defaultSave(), 3);
    const out = drawSticker(save, DAY, 'medal', NOW);

    expect(out.reason).toBe(null);
    expect(out.save.currency).toEqual({ star: 0, gem: 0, petFood: 0, medal: 2 });
    // 只断言 medal 变成 2 会让线上缺陷 1（不进流水）那种实现全绿，所以流水也断
    const ledger = ledgerOf(out.save, DAY);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      at: NOW,
      type: 'spend',
      reason: `抽贴纸：${out.sticker.name}`,
      star: 0,
      gem: 0,
      petFood: 0,
      medal: 1,
    });
  });

  it('[STICKER-12] 勋章不够：原样返回入参，reason 为 noMedal', () => {
    const save = defaultSave();
    const out = drawSticker(save, DAY, 'medal', NOW);

    expect(out.save).toBe(save);
    expect(out.sticker).toBe(null);
    expect(out.reason).toBe('noMedal');
    expect(out.save.currency.medal).toBe(0);
    expect(out.save.stickerCollection).toEqual({});
    expect(ledgerOf(out.save, DAY)).toEqual([]);
  });

  it('[STICKER-13] 勋章抽不消耗免费次数', () => {
    const out = drawSticker(withMedal(defaultSave(), 3), DAY, 'medal', NOW);

    expect(out.save.lastFreeStickerDate).toBe('');
    // 勋章抽完，今天的免费抽还在
    expect(stickerState(out.save, DAY).free.used).toBe(false);
  });

  it('[STICKER-14] 只剩一张没抽到时必定抽到它 —— 只从未拥有的里抽', () => {
    const save = withCollection(defaultSave(), ownFirst(139));
    const out = drawSticker(save, DAY, 'free', NOW);

    expect(out.sticker.id).toBe('st-139-彗星啦');
    expect(out.isNew).toBe(true);
    expect(out.save.stickerCollection['st-139-彗星啦']).toBe(1);
  });

  it('[STICKER-15] 140 张全拥有：抽空之后仍然抽得到，某一张 count 从 1 变 2', () => {
    const save = withCollection(defaultSave(), ownFirst(140));
    const out = drawSticker(save, DAY, 'free', NOW);

    // 与 STICKER-14 成对：本条挡「抽空之后返回 undefined 或抛错」
    expect(out.save).not.toBe(save);
    expect(out.sticker).not.toBe(null);
    expect(out.reason).toBe(null);
    expect(out.isNew).toBe(false);
    expect(out.save.stickerCollection[out.sticker.id]).toBe(2);
    expect(Object.keys(out.save.stickerCollection)).toHaveLength(140);
  });

  it('[STICKER-16] 同一份存档、同一个 key，抽到的是同一张（确定性）', () => {
    const save = defaultSave();

    expect(drawSticker(save, DAY, 'free', NOW).sticker.id).toBe(
      drawSticker(save, DAY, 'free', NOW + 99999).sticker.id,
    );
    // 免费抽与勋章抽共享同一个序号，所以同一天同一个序号下两种来源给同一张
    expect(drawSticker(withMedal(save, 1), DAY, 'medal', NOW).sticker.id).toBe(
      drawSticker(save, DAY, 'free', NOW).sticker.id,
    );
  });

  it('[STICKER-17] 连抽 140 次：一张不缺、一张不重', () => {
    let save = defaultSave();

    for (let i = 0; i < 140; i += 1) {
      // key 每次换一天，免费抽才不会被 freeUsed 挡住
      const out = drawSticker(save, `2026-08-17#${i}`, 'free', NOW + i);
      expect(out.reason).toBe(null);
      expect(out.isNew).toBe(true);
      save = out.save;
    }

    // 不断言「抽到了哪 140 张」—— 那由种子决定，写进规格就把实现钉死了
    const collection = save.stickerCollection;
    expect(Object.keys(collection)).toHaveLength(140);
    expect(Object.values(collection).every((count) => count === 1)).toBe(true);
    expect(stickerState(save, DAY)).toMatchObject({ owned: 140, percent: 100 });
  });

  it('[STICKER-18] 权重真的生效：只剩一 common 一 rare 时明显偏向 common', () => {
    const collection = {};
    for (const sticker of STICKERS) {
      if (sticker.id !== 'st-000-小狗狗' && sticker.id !== 'st-018-独角兽') {
        collection[sticker.id] = 1;
      }
    }
    const save = withCollection(defaultSave(), collection);

    let common = 0;
    let rare = 0;
    for (let i = 0; i < 200; i += 1) {
      // 200 个不同的 key，各自从同一份入参出发 —— 每次都是「第 138 次抽」
      const out = drawSticker(save, `2026-03-${i}`, 'free', NOW);
      if (out.sticker.id === 'st-000-小狗狗') common += 1;
      else rare += 1;
    }

    expect(common + rare).toBe(200);
    // 均匀抽会是 1:1，权重是 55:15 —— 断言比值明显偏向 common，不断言具体次数
    expect(common).toBeGreaterThan(rare * 2);
  });

  it('[STICKER-19] source 不是 free / medal 抛 RangeError', () => {
    for (const bad of ['gem', '', undefined, null, 'Free']) {
      expect(() => drawSticker(defaultSave(), DAY, bad, NOW)).toThrow(RangeError);
    }
  });

  it('[STICKER-20] now 非有限数抛 TypeError', () => {
    const save = withMedal(defaultSave(), 3);

    for (const bad of [NaN, undefined, 'x', Infinity, null]) {
      expect(() => drawSticker(save, DAY, 'medal', bad)).toThrow(TypeError);
    }
  });
});
