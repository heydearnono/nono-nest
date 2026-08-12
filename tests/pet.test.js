import { describe, expect, it } from 'vitest';

import { seedHabits } from '../miniprogram/utils/habit.js';
import {
  checkAwardAndGrow,
  choosePet,
  feed,
  petState,
  play,
  settleFullness,
} from '../miniprogram/utils/pet.js';
import { ledgerOf, uncheckAndRefund } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/pet/doc.md（`PET` / `FULLNESS` / `MOOD` 三个区）

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 12, 0, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 改宠物子对象。`lastFedAt` 默认立在 NOW，好让「没有衰减」成为基线 */
function withPet(save, pet) {
  return { ...save, pet: { ...save.pet, lastFedAt: NOW, ...pet } };
}

/** 改货币余额 */
function withCurrency(save, currency) {
  return { ...save, currency: { ...save.currency, ...currency } };
}

describe('饱腹度衰减（FULLNESS）', () => {
  it('[FULLNESS-01] lastFedAt 为 0 时不衰减，只把基准立成 now', () => {
    const save = seeded();
    expect(save.pet.lastFedAt).toBe(0);

    const next = settleFullness(save, NOW);

    expect(next.pet.fullness).toBe(3);
    expect(next.pet.lastFedAt).toBe(NOW);
  });

  it('[FULLNESS-02] 距上次喂食 6h：饱腹度 -1，基准前进 6h', () => {
    const save = withPet(seeded(), { fullness: 3, lastFedAt: NOW - 6 * HOUR });
    const next = settleFullness(save, NOW);

    expect(next.pet.fullness).toBe(2);
    expect(next.pet.lastFedAt).toBe(NOW - 6 * HOUR + 6 * HOUR);
  });

  it('[FULLNESS-03] 距上次喂食 5h59m：原样返回，饱腹度与基准都不动', () => {
    const lastFedAt = NOW - (5 * HOUR + 59 * 60 * 1000);
    const save = withPet(seeded(), { fullness: 3, lastFedAt });
    const next = settleFullness(save, NOW);

    expect(next).toBe(save);
    expect(next.pet.fullness).toBe(3);
    expect(next.pet.lastFedAt).toBe(lastFedAt);
  });

  it('[FULLNESS-04] 距上次喂食 13h：饱腹度 -2，基准只前进 12h（余 1h 不丢）', () => {
    const lastFedAt = NOW - 13 * HOUR;
    const save = withPet(seeded(), { fullness: 5, lastFedAt });
    const next = settleFullness(save, NOW);

    expect(next.pet.fullness).toBe(3);
    // 置成 now 会抹掉这 1 小时的余量 —— 每 5 小时开一次小程序宠物就永远不会饿
    expect(next.pet.lastFedAt).toBe(lastFedAt + 12 * HOUR);
    expect(NOW - next.pet.lastFedAt).toBe(HOUR);
  });

  it('[FULLNESS-05] 距上次喂食 30h、饱腹度 2：收敛到 0，不为负', () => {
    const save = withPet(seeded(), { fullness: 2, lastFedAt: NOW - 30 * HOUR });
    const next = settleFullness(save, NOW);

    expect(next.pet.fullness).toBe(0);
  });

  it('[FULLNESS-06] now 早于基准（时钟回拨）：原样返回，不倒着加饱腹度', () => {
    const save = withPet(seeded(), { fullness: 3, lastFedAt: NOW });
    const next = settleFullness(save, NOW - 20 * HOUR);

    expect(next).toBe(save);
    expect(next.pet.fullness).toBe(3);
  });

  it('[FULLNESS-07] now 非有限数抛 TypeError', () => {
    const save = seeded();

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '昨天', null, undefined]) {
      expect(() => settleFullness(save, bad)).toThrow(TypeError);
    }
  });

  it('[FULLNESS-08] 同一个 now 连续结算两次：第二次原样返回', () => {
    const save = withPet(seeded(), { fullness: 4, lastFedAt: NOW - 7 * HOUR });
    const once = settleFullness(save, NOW);
    const twice = settleFullness(once, NOW);

    expect(twice).toBe(once);
    expect(twice.pet.fullness).toBe(3);
  });
});

describe('开心度（MOOD）', () => {
  it('[MOOD-01] 打卡一项后开心度 +1', () => {
    const save = withPet(seeded(), { mood: 2 });

    expect(checkAwardAndGrow(save, DAY, 'wake', NOW).pet.mood).toBe(3);
  });

  it('[MOOD-02] 陪玩后开心度 +1', () => {
    const save = withPet(seeded(), { mood: 2 });

    expect(play(save, NOW).pet.mood).toBe(3);
  });

  it('[MOOD-03] 开心度已满时陪玩：原样返回，经验也不涨', () => {
    const save = withPet(seeded(), { mood: 5, petExp: 40 });
    const next = play(save, NOW);

    expect(next).toBe(save);
    expect(next.pet.petExp).toBe(40);
    expect(petState(next, NOW).playBlock).toBe('happy');
  });

  it('[MOOD-04] 开心度已满时打卡：开心度停在 5，但经验仍 +5', () => {
    const save = withPet(seeded(), { mood: 5, petExp: 40 });
    const next = checkAwardAndGrow(save, DAY, 'wake', NOW);

    // 与 MOOD-03 刻意不一致：打卡的经验是给「完成了一件事」的，
    // 不是给「宠物变开心」的
    expect(next.pet.mood).toBe(5);
    expect(next.pet.petExp).toBe(45);
  });

  it('[MOOD-05] 距上次喂食 30h 后结算：开心度不变（开心度不随时间衰减）', () => {
    const save = withPet(seeded(), { fullness: 5, mood: 4, lastFedAt: NOW - 30 * HOUR });
    const next = settleFullness(save, NOW);

    expect(next.pet.fullness).toBe(0);
    expect(next.pet.mood).toBe(4);
  });

  it('[MOOD-06] 取消打卡不回退经验与开心度，只退货币', () => {
    const save = withPet(seeded(), { mood: 2, petExp: 0 });
    const checked = checkAwardAndGrow(save, DAY, 'wake', NOW);
    const next = uncheckAndRefund(checked, DAY, 'wake', NOW + 1000);

    expect(next.currency.star).toBe(0);
    expect(next.pet.mood).toBe(3);
    expect(next.pet.petExp).toBe(5);
  });
});

describe('喂食与成长（PET）', () => {
  it('[PET-01] 有粮且没饱时喂食：扣 2 点粮、饱腹 +1、基准立成 now', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 3 }), { petFood: 6 });
    const next = feed(save, NOW + HOUR);

    expect(next.currency.petFood).toBe(4);
    expect(next.pet.fullness).toBe(4);
    expect(next.pet.lastFedAt).toBe(NOW + HOUR);
  });

  it('[PET-02] 喂食经验 +10', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 3, petExp: 20 }), { petFood: 6 });

    expect(feed(save, NOW).pet.petExp).toBe(30);
  });

  it('[PET-03] 饱腹度已满时喂食：原样返回，不扣宠物粮', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 5 }), { petFood: 6 });
    const next = feed(save, NOW);

    expect(next).toBe(save);
    expect(next.currency.petFood).toBe(6);
    expect(petState(next, NOW).feedBlock).toBe('full');
  });

  it('[PET-04] 宠物粮只有 1 点时喂食：原样返回，饱腹度不涨', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 2 }), { petFood: 1 });
    const next = feed(save, NOW);

    expect(next).toBe(save);
    expect(next.pet.fullness).toBe(2);
    expect(petState(next, NOW).feedBlock).toBe('noFood');
  });

  it('[PET-05] 距上次喂食 20h：先结算到 0 再 +1，结果是 1 而不是 4', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 3, lastFedAt: NOW - 20 * HOUR }), {
      petFood: 6,
    });
    const next = feed(save, NOW);

    expect(next.pet.fullness).toBe(1);
    expect(next.pet.lastFedAt).toBe(NOW);
  });

  it('[PET-06] 经验 95、等级 1 时喂食（+10）：升到 2 级，余 5 点经验', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 3, petLevel: 1, petExp: 95 }), {
      petFood: 6,
    });
    const next = feed(save, NOW);

    expect(next.pet.petLevel).toBe(2);
    expect(next.pet.petExp).toBe(5);
  });

  it('[PET-07] 经验 295、等级 1 时陪玩（+5）：一次跨两级到 3 级，经验归 0', () => {
    // 100（1→2）+ 200（2→3）= 300，正好用光
    const save = withPet(seeded(), { mood: 1, petLevel: 1, petExp: 295 });
    const next = play(save, NOW);

    expect(next.pet.petLevel).toBe(3);
    expect(next.pet.petExp).toBe(0);
  });

  it('[PET-08] 等级称号沿用线上五档，5 级以上固定为魔法伙伴', () => {
    const titleAt = (petLevel) => petState(withPet(seeded(), { petLevel }), NOW).levelTitle;

    expect([1, 2, 3, 4, 5, 9].map(titleAt)).toEqual([
      '幼年',
      '成长中',
      '可爱装饰',
      '小书包伙伴',
      '魔法伙伴',
      '魔法伙伴',
    ]);
  });

  it('[PET-09] 等级 3 时升级需求是 300（petLevel × 100），经验条按比例给百分比', () => {
    expect(petState(withPet(seeded(), { petLevel: 3 }), NOW).expToNext).toBe(300);
    expect(petState(withPet(seeded(), { petLevel: 1 }), NOW).expToNext).toBe(100);

    // 页面里不写公式也不调 Math.round，所以百分比在这里算好
    expect(petState(withPet(seeded(), { petLevel: 3, petExp: 150 }), NOW).expPercent).toBe(50);
    expect(petState(withPet(seeded(), { petLevel: 1, petExp: 0 }), NOW).expPercent).toBe(0);
  });

  it('[PET-10] 饱腹度 2 显示饿饿，3 不显示', () => {
    expect(petState(withPet(seeded(), { fullness: 2 }), NOW).fullnessLow).toBe(true);
    expect(petState(withPet(seeded(), { fullness: 3 }), NOW).fullnessLow).toBe(false);
  });

  it('[PET-11] feedBlock 的三种取值', () => {
    const at = (pet, petFood) => petState(withCurrency(withPet(seeded(), pet), { petFood }), NOW);

    expect(at({ fullness: 3 }, 6).feedBlock).toBe(null);
    expect(at({ fullness: 5 }, 6).feedBlock).toBe('full');
    expect(at({ fullness: 3 }, 1).feedBlock).toBe('noFood');
  });

  it('[PET-12] petState 读到的是结算后的饱腹度，不是存档里的旧值', () => {
    const save = withPet(seeded(), { fullness: 3, lastFedAt: NOW - 12 * HOUR });

    expect(save.pet.fullness).toBe(3);
    expect(petState(save, NOW).fullness).toBe(1);
  });

  it('[PET-13] 换形象时名字跟着换', () => {
    const next = choosePet(seeded(), 'rabbit');

    expect(next.pet.type).toBe('rabbit');
    expect(next.pet.name).toBe('棉棉');
    expect(petState(next, NOW).emoji).toBe('🐰');
  });

  it('[PET-14] 未登记的形象抛 RangeError', () => {
    expect(() => choosePet(seeded(), 'dragon')).toThrow(RangeError);
  });

  it('[PET-15] 打卡的货币与流水与 POINT 区一致，且经验 +5', () => {
    const save = withPet(seeded(), { petExp: 0 });
    const next = checkAwardAndGrow(save, DAY, 'wake', NOW);

    expect(next.currency.star).toBe(1);
    expect(next.currency.petFood).toBe(1);
    expect(ledgerOf(next, DAY)).toHaveLength(1);
    expect(ledgerOf(next, DAY)[0]).toMatchObject({ type: 'earn', reason: '完成：按时起床' });
    expect(next.pet.petExp).toBe(5);
  });

  it('[PET-16] 连续两次打卡同一项：经验、开心度、货币、流水都不再变', () => {
    const save = withPet(seeded(), { mood: 2, petExp: 0 });
    const once = checkAwardAndGrow(save, DAY, 'wake', NOW);
    const twice = checkAwardAndGrow(once, DAY, 'wake', NOW + 1000);

    expect(twice).toBe(once);
    expect(twice.pet.petExp).toBe(5);
    expect(twice.pet.mood).toBe(3);
    expect(twice.currency.star).toBe(1);
    expect(ledgerOf(twice, DAY)).toHaveLength(1);
  });

  it('[PET-17] 四个动作都不改传入的 save', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 3, mood: 2, petExp: 0 }), {
      petFood: 6,
    });
    const snapshot = JSON.parse(JSON.stringify(save));

    feed(save, NOW);
    play(save, NOW);
    choosePet(save, 'panda');
    checkAwardAndGrow(save, DAY, 'wake', NOW);

    expect(JSON.parse(JSON.stringify(save))).toEqual(snapshot);
  });

  it('[PET-18] now 非有限数抛 TypeError', () => {
    const save = withCurrency(withPet(seeded(), { fullness: 3 }), { petFood: 6 });

    expect(() => feed(save, Number.NaN)).toThrow(TypeError);
    expect(() => play(save, '现在')).toThrow(TypeError);
    expect(() => checkAwardAndGrow(save, DAY, 'wake', Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('[PET-19] petState().types 有 5 条，当前形象那条 current 为 true', () => {
    const types = petState(choosePet(seeded(), 'cat'), NOW).types;

    expect(types).toHaveLength(5);
    expect(types.filter((item) => item.current).map((item) => item.type)).toEqual(['cat']);
    expect(types[0]).toEqual({
      type: 'unicorn',
      displayName: '彩虹独角兽',
      emoji: '🦄',
      current: false,
    });
  });
});

describe('与存档区的边界', () => {
  it('存档里的 type 被写坏时 petState 不抛错，退回第一个形象的 emoji', () => {
    // petState 在渲染路径上，抛错等于白屏 —— 与 choosePet 的严格刻意相反
    const save = withPet(seeded(), { type: 'godzilla' });

    expect(petState(save, NOW).emoji).toBe('🦄');
    expect(petState(save, NOW).type).toBe('godzilla');
  });
});
