import { describe, expect, it } from 'vitest';

import { exportJson, parentState, saveSettings, verifyPin } from '../miniprogram/utils/parent.js';
import { defaultSave, normalizeSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/parent/doc.md（`PARENT` 区）
// 按 AGENTS.md 第 13 条：parentState 的规格断言读取入口的输出，
// 水位类（pinFails / pinLockedUntil）的规格断言存档里落了什么。
const NOW = new Date(2026, 7, 14, 20, 0, 0, 0).getTime();
const LOCK_MS = 60000;

/** 一份带 parent 子键的干净存档 */
function seeded(parent = {}) {
  const base = defaultSave();
  return { ...base, parent: { ...base.parent, ...parent } };
}

/** 连着验错 n 次，返回最后那份存档 */
function failTimes(save, n, now = NOW) {
  let out = save;
  for (let i = 0; i < n; i += 1) {
    out = verifyPin(out, '9999', now).save;
  }
  return out;
}

describe('parentState', () => {
  it('[PARENT-01] 空存档给出三个设置项的默认值、没在冷却、还能错 5 次', () => {
    const state = parentState(defaultSave(), NOW);

    expect(state.pin).toBe('1234');
    expect(state.dailyGoal).toBe(6);
    expect(state.note).toBe('');
    expect(state.locked).toBe(false);
    expect(state.lockedSeconds).toBe(0);
    expect(state.failsLeft).toBe(5);
    expect(state.childName).toBe('nono');
  });

  it('[PARENT-02] summary 数出「这台机器上有多少数据」', () => {
    const days = {};
    for (let i = 1; i <= 12; i += 1) {
      days[`2026-08-${String(i).padStart(2, '0')}`] = { checks: {} };
    }

    const chars = {};
    for (let i = 0; i < 30; i += 1) {
      chars[`字${i}`] = { step: 1, due: '', wrong: 0 };
    }

    const poems = { p1: {}, p2: {}, p3: {} };
    const rounds = {};
    for (let i = 1; i <= 8; i += 1) {
      rounds[`m1-${i}`] = { correct: true, wrong: 0 };
    }

    const save = {
      ...seeded(),
      days,
      currency: { star: 40, gem: 0, petFood: 0, medal: 2 },
      learningProgress: {
        literacy: { chars },
        guoxue: { poems, weekly: { weekKey: '', ids: [] } },
        math: { rounds, stage: 2 },
      },
    };

    expect(parentState(save, NOW).summary).toEqual({
      days: 12,
      chars: 30,
      poems: 3,
      rounds: 8,
      star: 40,
      medal: 2,
    });
  });

  it('[PARENT-09] 冷却期内 locked 为真、剩余秒数向上取整、failsLeft 为 0', () => {
    // 还剩 30.2 秒 —— 显示「31 秒」而不是「30 秒」，宁愿多等一秒也不显示 0 却点不动
    const save = seeded({ pinFails: 5, pinLockedUntil: NOW + 30200 });
    const state = parentState(save, NOW);

    expect(state.locked).toBe(true);
    expect(state.lockedSeconds).toBe(31);
    expect(state.failsLeft).toBe(0);

    // 到期那一刻就不算冷却了（remain 为 0 不是「还剩 0 秒」）
    const expired = parentState(seeded({ pinFails: 5, pinLockedUntil: NOW }), NOW);
    expect(expired.locked).toBe(false);
    expect(expired.lockedSeconds).toBe(0);
  });

  it('[PARENT-20] parentState 的 now 非有限数抛 TypeError', () => {
    // 与 MATH-34 不同：那个 now 是签名占位，这个要现算冷却剩余秒数 ——
    // 拿 NaN 算出来的 locked 是 false，那会静默解掉冷却
    expect(() => parentState(defaultSave(), NaN)).toThrow(TypeError);
    expect(() => parentState(defaultSave(), Infinity)).toThrow(TypeError);
    expect(() => parentState(defaultSave(), '123')).toThrow(TypeError);
    expect(() => parentState(defaultSave(), undefined)).toThrow(TypeError);
  });

  it('[PARENT-21] 脏存档读取时收敛，不抛错', () => {
    const dirty = parentState(seeded({ pinFails: -3, pinLockedUntil: -1 }), NOW);
    expect(dirty.failsLeft).toBe(5);
    expect(dirty.locked).toBe(false);

    const over = parentState(seeded({ pinFails: 99, pinLockedUntil: NOW + 1000 }), NOW);
    expect(over.failsLeft).toBe(0);
    expect(over.locked).toBe(true);

    // 整块 parent 是坏结构时给默认值
    expect(() => parentState({ ...defaultSave(), parent: 42 }, NOW)).not.toThrow();
    expect(parentState({ ...defaultSave(), parent: null }, NOW).pin).toBe('1234');
    expect(parentState(undefined, NOW).failsLeft).toBe(5);
    expect(parentState({}, NOW).summary).toEqual({
      days: 0,
      chars: 0,
      poems: 0,
      rounds: 0,
      star: 0,
      medal: 0,
    });
  });
});

describe('verifyPin', () => {
  it('[PARENT-03] PIN 正确时 ok，reason 为 null，存档里 pinFails 清零', () => {
    const result = verifyPin(seeded({ pinFails: 2 }), '1234', NOW);

    expect(result.ok).toBe(true);
    expect(result.reason).toBe(null);
    expect(result.save.parent.pinFails).toBe(0);
    expect(result.save.parent.pinLockedUntil).toBe(0);
  });

  it('[PARENT-04] PIN 错误时 reason 为 wrong，pinFails 加 1、还没进冷却', () => {
    const result = verifyPin(seeded(), '9999', NOW);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong');
    expect(result.save.parent.pinFails).toBe(1);
    expect(result.save.parent.pinLockedUntil).toBe(0);
  });

  it('[PARENT-05] 连错第 5 次落 pinLockedUntil = now + 60000', () => {
    const save = failTimes(seeded(), 4);
    expect(save.parent.pinFails).toBe(4);
    expect(save.parent.pinLockedUntil).toBe(0);

    const fifth = verifyPin(save, '9999', NOW);
    expect(fifth.reason).toBe('wrong');
    expect(fifth.save.parent.pinFails).toBe(5);
    expect(fifth.save.parent.pinLockedUntil).toBe(NOW + LOCK_MS);
  });

  it('[PARENT-06] 冷却期内原样返回入参，连正确的 PIN 也不验、pinFails 不加', () => {
    // 本轮偏离线上最要紧的一条：少了它，冷却期间乱点能把 60 秒续成永久
    const locked = failTimes(seeded(), 5);
    const during = NOW + 10000;

    const wrong = verifyPin(locked, '9999', during);
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toBe('locked');
    expect(wrong.save).toBe(locked);

    const right = verifyPin(locked, '1234', during);
    expect(right.ok).toBe(false);
    expect(right.reason).toBe('locked');
    expect(right.save).toBe(locked);

    // 乱点十次之后，到期时刻仍是第一次锁上时算的那个
    let after = locked;
    for (let i = 0; i < 10; i += 1) {
      after = verifyPin(after, '0000', during).save;
    }
    expect(after.parent.pinLockedUntil).toBe(NOW + LOCK_MS);
    expect(after.parent.pinFails).toBe(5);
  });

  it('[PARENT-07] 冷却到期后验对，两个水位都回 0', () => {
    const locked = failTimes(seeded(), 5);
    const later = NOW + LOCK_MS + 1;

    const result = verifyPin(locked, '1234', later);
    expect(result.ok).toBe(true);
    expect(result.save.parent.pinFails).toBe(0);
    expect(result.save.parent.pinLockedUntil).toBe(0);

    // 到期后第一次输错从 1 数起，不是从 5 接着数（否则一次错就又锁 60 秒）
    const again = verifyPin(locked, '9999', later);
    expect(again.reason).toBe('wrong');
    expect(again.save.parent.pinFails).toBe(1);
    expect(again.save.parent.pinLockedUntil).toBe(0);
  });

  it('[PARENT-08] 连错 4 次后验对，pinFails 回 0（错误计数不跨越一次成功累加）', () => {
    const four = failTimes(seeded(), 4);
    const ok = verifyPin(four, '1234', NOW);

    expect(ok.ok).toBe(true);
    expect(ok.save.parent.pinFails).toBe(0);

    // 清零之后再连错四次也不该进冷却
    const nextFour = failTimes(ok.save, 4);
    expect(nextFour.parent.pinFails).toBe(4);
    expect(nextFour.parent.pinLockedUntil).toBe(0);
  });

  it('[PARENT-19] verifyPin 的 now 非有限数抛 TypeError', () => {
    expect(() => verifyPin(defaultSave(), '1234', NaN)).toThrow(TypeError);
    expect(() => verifyPin(defaultSave(), '1234', undefined)).toThrow(TypeError);
    expect(() => verifyPin(defaultSave(), '1234', '0')).toThrow(TypeError);
  });

  it('[PARENT-23] 非字符串的输入按「错了」算，不抛错', () => {
    // 输入来自输入框，什么都可能 —— 数字 1234 与字符串 '1234' 不是同一个东西
    for (const input of [1234, null, undefined, {}, ['1234']]) {
      const result = verifyPin(seeded(), input, NOW);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('wrong');
    }
    expect(verifyPin(seeded(), 1234, NOW).save.parent.pinFails).toBe(1);
  });
});

describe('saveSettings', () => {
  it('[PARENT-10] 只改传进来的字段，其余不动', () => {
    const save = seeded({ note: '不许改我' });
    const next = saveSettings(save, { childName: '糯糯', dailyGoal: 8 });

    expect(next.childName).toBe('糯糯');
    expect(next.parent.dailyGoal).toBe(8);
    expect(next.parent.pin).toBe('1234');
    expect(next.parent.note).toBe('不许改我');
    // 原存档不被改动（纯函数）
    expect(save.childName).toBe('nono');
  });

  it('[PARENT-11] childName 全空白回落 nono，不落空串', () => {
    const next = saveSettings(seeded(), { childName: '   ' });
    expect(next.childName).toBe('nono');

    // 两侧空白 trim 掉，中间的留着
    expect(saveSettings(seeded(), { childName: '  小 糯  ' }).childName).toBe('小 糯');
    // 非字符串也回落，不抛错（家长真的可能清空输入框再保存）
    expect(saveSettings(seeded(), { childName: null }).childName).toBe('nono');
  });

  it('[PARENT-12] dailyGoal 夹到 1 ~ 12', () => {
    expect(saveSettings(seeded(), { dailyGoal: 99 }).parent.dailyGoal).toBe(12);
    expect(saveSettings(seeded(), { dailyGoal: 0 }).parent.dailyGoal).toBe(1);
    expect(saveSettings(seeded(), { dailyGoal: -5 }).parent.dailyGoal).toBe(1);
    expect(saveSettings(seeded(), { dailyGoal: 7.6 }).parent.dailyGoal).toBe(8);
    // 非数值是编程错误（页面已 parseInt 过）
    expect(() => saveSettings(seeded(), { dailyGoal: '8' })).toThrow(RangeError);
    expect(() => saveSettings(seeded(), { dailyGoal: NaN })).toThrow(RangeError);
  });

  it('[PARENT-13] pin 不是 4 位数字抛 RangeError', () => {
    // 这条把线上那个「规则页边打边写、删到一位就落盘」的第二入口彻底关掉
    for (const pin of ['12', '12345', 'abcd', '12a4', '', 1234, null]) {
      expect(() => saveSettings(seeded(), { pin })).toThrow(RangeError);
    }
  });

  it('[PARENT-14] 改 pin 时顺带清零两个水位', () => {
    const locked = seeded({ pinFails: 5, pinLockedUntil: NOW + LOCK_MS });
    const next = saveSettings(locked, { pin: '4321' });

    expect(next.parent.pin).toBe('4321');
    expect(next.parent.pinFails).toBe(0);
    expect(next.parent.pinLockedUntil).toBe(0);

    // 只改昵称时水位原样留着 —— 清零是「改了密码」的后果，不是「保存过」的后果
    const renamed = saveSettings(locked, { childName: '糯糯' });
    expect(renamed.parent.pinFails).toBe(5);
    expect(renamed.parent.pinLockedUntil).toBe(NOW + LOCK_MS);

    // 传的 pin 与现值相同时整个函数走「无变化」那一支，水位也不动（PARENT-15）
    expect(saveSettings(locked, { pin: '1234' })).toBe(locked);
  });

  it('[PARENT-15] 无变化时原样返回入参（对象同一性）', () => {
    const save = seeded({ note: '备注' });

    expect(saveSettings(save, {})).toBe(save);
    expect(saveSettings(save, { dailyGoal: 6 })).toBe(save);
    expect(saveSettings(save, { childName: 'nono', pin: '1234', note: '备注' })).toBe(save);
    // 空白 trim 之后与现值相同也算无变化
    expect(saveSettings(save, { note: '  备注  ' })).toBe(save);
    expect(saveSettings(save, { childName: '  nono ' })).toBe(save);
  });

  it('[PARENT-16] 未登记的字段抛 RangeError', () => {
    // 家长端不是万能写入口：货币与进度只能靠打卡产出
    expect(() => saveSettings(seeded(), { star: 999 })).toThrow(RangeError);
    expect(() => saveSettings(seeded(), { pinFails: 0 })).toThrow(RangeError);
    expect(() => saveSettings(seeded(), { pinLockedUntil: 0 })).toThrow(RangeError);
    expect(() => saveSettings(seeded(), { childName: '糯糯', habits: [] })).toThrow(RangeError);
    expect(() => saveSettings(seeded(), null)).toThrow(RangeError);
    expect(() => saveSettings(seeded(), [])).toThrow(RangeError);
  });
});

describe('exportJson', () => {
  it('[PARENT-17] 导出的是能 JSON.parse 回原存档的带缩进字符串', () => {
    const save = seeded({ note: '换行\n也要活着' });
    const text = exportJson(save);

    expect(typeof text).toBe('string');
    expect(JSON.parse(text)).toEqual(save);
    // 带缩进（含换行）—— 家长要能在剪贴板里看出这是一份存档，不是一行乱码
    expect(text).toContain('\n');
    expect(text).toContain('\n  "parent"');
  });

  it('[PARENT-18] 导出 → 导入一个来回不掉字段', () => {
    // 只有 PARENT-17 会被「导出一个 {}」蒙过（它也能 JSON.parse），
    // 只有 PARENT-18 会被「导出时丢了 days」蒙过 —— 两条一起才钉住导出
    const save = {
      ...seeded({ pin: '4321', dailyGoal: 9, note: '备注', pinFails: 2 }),
      childName: '糯糯',
      currency: { star: 40, gem: 3, petFood: 6, medal: 2 },
      days: { '2026-08-14': { checks: { wake: true } } },
      achievements: ['early-bird'],
      lastWeeklyBonusWeek: '2026-08-10',
      learningProgress: {
        literacy: { chars: { 天: { step: 3, due: '2026-08-20', wrong: 1 } } },
        guoxue: { poems: {}, weekly: { weekKey: '2026-08-10', ids: ['p1'] } },
        math: { rounds: { 'm1-1': { correct: true, wrong: 0 } }, stage: 2 },
      },
    };
    const normalized = normalizeSave(save);

    expect(normalizeSave(JSON.parse(exportJson(normalized)))).toEqual(normalized);
  });
});

describe('缺陷 6：dailyGoal 的上界在存档层', () => {
  it('[PARENT-22] 导入来的 dailyGoal: 99 被 normalizeSave 夹到 12', () => {
    // 线上那道 Math.min(12, …) 只在设置页里，导入绕得过去 ——
    // 于是看板拿 99 当分母，永远显示「差 99 项」。上界落到存档层之后那条路径消失。
    expect(normalizeSave({ parent: { dailyGoal: 99 } }).parent.dailyGoal).toBe(12);

    // 夹过之后 parentState 读到的也是 12（家长端与看板同一个口径）
    const state = parentState(normalizeSave({ parent: { dailyGoal: 99 } }), NOW);
    expect(state.dailyGoal).toBe(12);

    // 手拼的脏存档没走 normalizeSave 时，parentState 自己再夹一次
    expect(parentState(seeded({ dailyGoal: 99 }), NOW).dailyGoal).toBe(12);
  });
});
