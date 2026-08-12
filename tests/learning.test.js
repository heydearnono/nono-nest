import { describe, expect, it } from 'vitest';

import { seedHabits } from '../miniprogram/utils/habit.js';
import {
  completeLearning,
  learningBlock,
  learningLog,
  listLearning,
} from '../miniprogram/utils/learning.js';
import { ledgerOf } from '../miniprogram/utils/point.js';
import { defaultSave } from '../miniprogram/utils/save.js';

// 规格来源：docs/features/learning/doc.md（`LEARN` / `READ` / `ENG` 三个区）

const DAY = '2026-08-12';
const NOW = new Date(2026, 7, 12, 19, 0, 0, 0).getTime();

/** 一份已填好默认任务表的存档 */
function seeded() {
  return seedHabits(defaultSave());
}

/** 一份填好的阅读表单 */
function readForm(patch) {
  return {
    minutes: 20,
    bookTitle: '小熊的一天',
    pages: 12,
    mode: 'together',
    favorite: '小熊摔倒那页',
    mood: '😍',
    ...patch,
  };
}

/** 一份填好的英语表单 */
function engForm(patch) {
  return {
    minutes: 15,
    words: 'apple, bear',
    sentences: 'I see a bear.',
    readAloudCount: 3,
    parentNote: '',
    ...patch,
  };
}

/** 打一次阅读卡，返回新存档 */
function readChecked(save = seeded(), patch) {
  return completeLearning(save, DAY, 'reading', readForm(patch), NOW);
}

describe('学习入口与共用的打卡链（LEARN）', () => {
  it('[LEARN-01] listLearning 给出 5 条，按 sortOrder 的顺序', () => {
    const { items, total } = listLearning(seeded(), DAY);

    expect(total).toBe(5);
    expect(items.map((item) => item.module)).toEqual([
      'literacy',
      'reading',
      'guoxue',
      'math',
      'english',
    ]);
    // 线上入口页的顺序是国学在最前，本仓库统一按 data/defaultHabits.js 的 sortOrder
    expect(items[1]).toMatchObject({ name: '阅读', icon: '📖', desc: '亲子/独立阅读' });
  });

  it('[LEARN-02] 只有阅读与英语 ready，其余三格还没做', () => {
    const { items } = listLearning(seeded(), DAY);
    const ready = items.filter((item) => item.ready).map((item) => item.module);

    expect(ready).toEqual(['reading', 'english']);
  });

  it('[LEARN-03] 打过阅读卡后那一格 done，汇总为 1/5', () => {
    const summary = listLearning(readChecked(), DAY);

    expect(summary.done).toBe(1);
    expect(summary.total).toBe(5);
    expect(summary.items.find((item) => item.module === 'reading').done).toBe(true);
    expect(summary.items.find((item) => item.module === 'english').done).toBe(false);
  });

  it('[LEARN-04] 未登记的 module 抛 RangeError', () => {
    const save = seeded();

    expect(() => completeLearning(save, DAY, 'piano', {}, NOW)).toThrow(RangeError);
    expect(() => learningLog(save, DAY, 'piano')).toThrow(RangeError);
    expect(() => learningBlock(save, DAY, 'piano', {})).toThrow(RangeError);
  });

  it('[LEARN-05] now 非有限数抛 TypeError', () => {
    const save = seeded();

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '今天', null, undefined]) {
      expect(() => completeLearning(save, DAY, 'reading', readForm(), bad)).toThrow(TypeError);
    }
  });

  it('[LEARN-06] 同一模块连续两次：第二次原样返回，记录也不被改写', () => {
    const once = readChecked();
    const twice = completeLearning(
      once,
      DAY,
      'reading',
      readForm({ bookTitle: '换一本' }),
      NOW + 1,
    );

    // 与线上的偏差：线上第二次会把记录合并改写，这里停在第一次
    expect(twice).toBe(once);
    expect(twice.days[DAY].learning.reading.bookTitle).toBe('小熊的一天');
    expect(twice.currency.star).toBe(2);
    expect(ledgerOf(twice, DAY)).toHaveLength(1);
    expect(twice.pet.petExp).toBe(8);
  });

  it('[LEARN-07] 阅读打卡产出 2 星 2 粮，流水一条', () => {
    const next = readChecked();

    expect(next.currency.star).toBe(2);
    expect(next.currency.petFood).toBe(2);
    expect(ledgerOf(next, DAY)).toHaveLength(1);
    expect(ledgerOf(next, DAY)[0]).toMatchObject({
      type: 'earn',
      star: 2,
      petFood: 2,
      reason: '完成：阅读',
    });
  });

  it('[LEARN-08] 学习打卡经验 +8（不是自律打卡的 5），开心度 +1', () => {
    const save = { ...seeded(), pet: { ...seeded().pet, petExp: 0, mood: 2 } };
    const next = completeLearning(save, DAY, 'reading', readForm(), NOW);

    expect(next.pet.petExp).toBe(8);
    expect(next.pet.mood).toBe(3);
  });

  it('[LEARN-09] completeLearning 不改传入的 save', () => {
    const save = seeded();
    const snapshot = JSON.parse(JSON.stringify(save));

    completeLearning(save, DAY, 'reading', readForm(), NOW);
    completeLearning(save, DAY, 'english', engForm(), NOW);

    expect(JSON.parse(JSON.stringify(save))).toEqual(snapshot);
  });

  it('[LEARN-10] checks / ledger / learning 三个兄弟键同时存在，互不覆盖', () => {
    const next = completeLearning(readChecked(), DAY, 'english', engForm(), NOW + 1000);
    const day = next.days[DAY];

    expect(Object.keys(day).sort()).toEqual(['checks', 'learning', 'ledger']);
    expect(Object.keys(day.checks).sort()).toEqual(['english', 'reading']);
    expect(day.ledger).toHaveLength(2);
    expect(Object.keys(day.learning).sort()).toEqual(['english', 'reading']);
  });

  it('[LEARN-11] habits 里没有对应任务时：提交抛错，入口页仍能渲染', () => {
    const save = seeded();
    const without = { ...save, habits: save.habits.filter((habit) => habit.module !== 'reading') };

    expect(() => completeLearning(without, DAY, 'reading', readForm(), NOW)).toThrow(RangeError);
    // listLearning 在渲染路径上，抛错等于白屏 —— 家长删掉任务后那格显示「还没做」
    expect(listLearning(without, DAY).items.find((item) => item.module === 'reading').done).toBe(
      false,
    );
  });
});

describe('阅读打卡（READ）', () => {
  it('[READ-01] 六个字段原样落进 days[key].learning.reading', () => {
    const record = readChecked().days[DAY].learning.reading;

    expect(record).toEqual({
      minutes: 20,
      bookTitle: '小熊的一天',
      pages: 12,
      mode: 'together',
      favorite: '小熊摔倒那页',
      mood: '😍',
    });
    // 打卡时刻在 checks 里，记录里不存第二份
    expect(record.at).toBeUndefined();
  });

  it('[READ-02] 书名为空或全空格：noTitle，提交原样返回', () => {
    const save = seeded();

    for (const bookTitle of ['', '   ', undefined]) {
      const form = readForm({ bookTitle });
      expect(learningBlock(save, DAY, 'reading', form)).toBe('noTitle');
      expect(completeLearning(save, DAY, 'reading', form, NOW)).toBe(save);
    }
  });

  it('[READ-03] 今天已经打过阅读卡：done，记录停在第一次', () => {
    const once = readChecked();

    expect(learningBlock(once, DAY, 'reading', readForm())).toBe('done');
    expect(once.days[DAY].learning.reading.minutes).toBe(20);
  });

  it('[READ-04] minutes 与 pages 收敛成非负整数', () => {
    const at = (patch) => readChecked(seeded(), patch).days[DAY].learning.reading;

    expect(at({ minutes: '' }).minutes).toBe(0);
    expect(at({ minutes: -3 }).minutes).toBe(0);
    expect(at({ minutes: 20.4 }).minutes).toBe(20);
    expect(at({ pages: '8' }).pages).toBe(8);
    expect(at({ pages: -1 }).pages).toBe(0);
  });

  it('[READ-05] mode 不在白名单里时落 together', () => {
    expect(readChecked(seeded(), { mode: 'alone' }).days[DAY].learning.reading.mode).toBe(
      'together',
    );
    expect(readChecked(seeded(), { mode: 'solo' }).days[DAY].learning.reading.mode).toBe('solo');
  });

  it('[READ-06] mood 不在五个 emoji 里时落 😊', () => {
    expect(readChecked(seeded(), { mood: '🤖' }).days[DAY].learning.reading.mood).toBe('😊');
  });

  it('[READ-07] 没填过时表单初值：20 分钟不是默认，默认是 15', () => {
    expect(learningLog(seeded(), DAY, 'reading')).toEqual({
      minutes: 15,
      bookTitle: '',
      pages: 0,
      mode: 'together',
      favorite: '',
      mood: '😊',
    });
  });

  it('[READ-08] 打过卡后表单回显存档里的六个字段', () => {
    expect(learningLog(readChecked(), DAY, 'reading')).toEqual(readForm());
  });
});

describe('英语打卡（ENG）', () => {
  it('[ENG-01] 五个字段原样落进 days[key].learning.english', () => {
    const next = completeLearning(seeded(), DAY, 'english', engForm(), NOW);

    expect(next.days[DAY].learning.english).toEqual({
      minutes: 15,
      words: ['apple', 'bear'],
      sentences: ['I see a bear.'],
      readAloudCount: 3,
      parentNote: '',
    });
  });

  it('[ENG-02] words 中英文逗号都切，去空白与空项', () => {
    const form = engForm({ words: 'apple, bear，cat ,' });
    const next = completeLearning(seeded(), DAY, 'english', form, NOW);

    expect(next.days[DAY].learning.english.words).toEqual(['apple', 'bear', 'cat']);
  });

  it('[ENG-03] sentences 按竖线切 —— 句子里本来就有逗号与句号', () => {
    const form = engForm({ sentences: 'I see a bear. | Good night.' });
    const next = completeLearning(seeded(), DAY, 'english', form, NOW);

    expect(next.days[DAY].learning.english.sentences).toEqual(['I see a bear.', 'Good night.']);
  });

  it('[ENG-04] readAloudCount 收敛到 0-10', () => {
    const at = (readAloudCount) =>
      completeLearning(seeded(), DAY, 'english', engForm({ readAloudCount }), NOW).days[DAY]
        .learning.english.readAloudCount;

    expect(at(-1)).toBe(0);
    expect(at(99)).toBe(10);
    expect(at(10)).toBe(10);
  });

  it('[ENG-05] 今天已经打过英语卡：done，第二次原样返回', () => {
    const once = completeLearning(seeded(), DAY, 'english', engForm(), NOW);
    const twice = completeLearning(once, DAY, 'english', engForm({ minutes: 99 }), NOW + 1);

    expect(learningBlock(once, DAY, 'english', engForm())).toBe('done');
    expect(twice).toBe(once);
  });

  it('[ENG-06] 英语没有必填字段，空表单也能打卡', () => {
    const save = seeded();
    const empty = { minutes: '', words: '', sentences: '', readAloudCount: 0, parentNote: '' };

    // 与 READ-02 刻意不一致：阅读的「读了哪本」除了这张表没有别处记，
    // 英语是跟着课程 App 上完课回来记一笔
    expect(learningBlock(save, DAY, 'english', empty)).toBe(null);

    const next = completeLearning(save, DAY, 'english', empty, NOW);
    expect(next).not.toBe(save);
    expect(next.days[DAY].learning.english.words).toEqual([]);
    expect(next.currency.star).toBe(2);
  });

  it('[ENG-07] 表单回显时数组连回字符串', () => {
    const once = completeLearning(seeded(), DAY, 'english', engForm(), NOW);

    expect(learningLog(once, DAY, 'english')).toEqual({
      minutes: 15,
      words: 'apple, bear',
      sentences: 'I see a bear.',
      readAloudCount: 3,
      parentNote: '',
    });
  });
});
