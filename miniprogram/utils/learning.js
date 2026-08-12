/**
 * 学习域：入口页的读取、阅读与英语的表单收敛与打卡。
 *
 * 规格来源：docs/features/learning/doc.md（`LEARN` / `READ` / `ENG` 三个区）
 *
 * 依赖方向 learning.js → pet.js → point.js → habit.js → data/，无环。
 *
 * **一条打卡链，两张表。** 阅读与英语的差别只在表单字段，打卡之后的事完全相同
 * （写记录 → 打卡 → 发货币与流水 → 涨经验与开心度），所以只有一个
 * `completeLearning`，按 `module` 取一张规范化表。写成两个函数会让发放与幂等
 * 的逻辑抄两遍，而那正是最不能不一致的地方。
 */

import { LEARNING_MODULES } from '../data/learningModules.js';
import { checkAwardAndGrow } from './pet.js';

/** 学习打卡产出的经验。线上五个学习模块都是 8，自律打卡是 5 */
const EXP_PER_LEARNING = 8;

/** 阅读时长的默认值，抄线上 `useState(minutes ?? 15)` —— 「一次阅读大概多久」 */
const READ_DEFAULT_MINUTES = 15;

/**
 * 阅读页两个选择行的可选值。**导出给页面渲染用**，与 `petState().types` 同一条理由：
 * 页面不跨过 utils 直接摸常量区，也不把白名单抄第二遍 —— 抄第二遍就会出现
 * 「按钮上有第三种方式，但 `toRecord` 把它收敛掉了」这种对不上的情况。
 *
 * 两个数组的第一项都是默认值（`oneOf` 的兜底）。
 */
export const READ_OPTIONS = {
  modes: [
    { value: 'together', label: '亲子共读' },
    { value: 'solo', label: '独立阅读' },
  ],
  moods: ['😊', '😍', '🤔', '😴', '🥳'],
};

/** 阅读的两种方式，第一个是默认值 */
const READ_MODES = READ_OPTIONS.modes.map((item) => item.value);

/** 阅读心情的五个 emoji，抄线上，第一个是默认值 */
const READ_MOODS = READ_OPTIONS.moods;

/** 跟读次数的上限，抄线上 `<input type="range" min=0 max=10>` */
const READ_ALOUD_MAX = 10;

/**
 * 英语页那个加减器的边界。**导出给页面用**，与 `READ_OPTIONS` 同一条理由：
 * 页面上按得出 11 而存档里落 10，就是「按钮与收敛对不上」。
 * 收敛的权威仍在 `toRecord`（`ENG-04`），这里导出的只是同一个数。
 */
export const ENG_OPTIONS = {
  readAloudMin: 0,
  readAloudMax: READ_ALOUD_MAX,
};

/** 单词的分隔符：中英文逗号都收（孩子的家长两种都会打） */
const WORDS_SEPARATOR = /[,，]/;

/** 句子的分隔符：竖线。句子里本来就有逗号与句号，不能用它们切 */
const SENTENCES_SEPARATOR = '|';

/** 单词回填成字符串时的连接符 */
const WORDS_JOINER = ', ';

/** 句子回填成字符串时的连接符 */
const SENTENCES_JOINER = ' | ';

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
 * 去掉首尾空白的字符串，非字符串一律空串。
 *
 * @param {unknown} value 表单值
 * @returns {string}
 */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 白名单里的取值，不在里面就取第一个。
 *
 * @param {unknown} value 表单值
 * @param {string[]} allowed 白名单，第一个是默认值
 * @returns {string}
 */
function oneOf(value, allowed) {
  return allowed.includes(value) ? value : allowed[0];
}

/**
 * 按分隔符切成数组，去空白、丢空项。
 *
 * @param {unknown} value 表单里的字符串
 * @param {RegExp | string} separator 分隔符
 * @returns {string[]}
 */
function split(value, separator) {
  return text(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 数组原样收下（存档回填的路径），字符串则切开（表单提交的路径）。
 *
 * @param {unknown} value 数组或字符串
 * @param {RegExp | string} separator 分隔符
 * @returns {string[]}
 */
function toList(value, separator) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return split(value, separator);
}

/**
 * 两张规范化表。每张管三件事：表单初值、表单 → 存档、存档 → 表单。
 *
 * `toRecord` 与 `toForm` 是一对来回：`words` / `sentences` 在存档里是数组、
 * 在输入框里是字符串，转换只发生在这两处，页面不做 join / split。
 *
 * `block` 是各自的必填校验。阅读要书名、英语什么都不填也能打卡 ——
 * 刻意不一致，理由见 doc.md（READ-02 与 ENG-06 各钉一条）。
 */
const FORMS = {
  reading: {
    emptyForm: {
      minutes: READ_DEFAULT_MINUTES,
      bookTitle: '',
      pages: 0,
      mode: READ_MODES[0],
      favorite: '',
      mood: READ_MOODS[0],
    },
    toRecord(form) {
      return {
        minutes: nonNegativeInt(form.minutes),
        bookTitle: text(form.bookTitle),
        pages: nonNegativeInt(form.pages),
        mode: oneOf(form.mode, READ_MODES),
        favorite: text(form.favorite),
        mood: oneOf(form.mood, READ_MOODS),
      };
    },
    toForm(record) {
      return this.toRecord(record);
    },
    block(form) {
      // 书名是这条记录里唯一能让家长回头认出「读的是哪本」的字段，抄线上的必填
      return text(form.bookTitle) === '' ? 'noTitle' : null;
    },
  },

  english: {
    emptyForm: {
      minutes: 0,
      words: '',
      sentences: '',
      readAloudCount: 0,
      parentNote: '',
    },
    toRecord(form) {
      return {
        minutes: nonNegativeInt(form.minutes),
        words: toList(form.words, WORDS_SEPARATOR),
        sentences: toList(form.sentences, SENTENCES_SEPARATOR),
        readAloudCount: nonNegativeInt(form.readAloudCount, READ_ALOUD_MAX),
        parentNote: text(form.parentNote),
      };
    },
    toForm(record) {
      const normalized = this.toRecord(record);
      return {
        ...normalized,
        words: normalized.words.join(WORDS_JOINER),
        sentences: normalized.sentences.join(SENTENCES_JOINER),
      };
    },
    block() {
      // 英语没有必填字段：它是跟着课程 App 上完课回来「记一笔」，
      // 课程内容不由这张表定义（与 reading 刻意不一致，见 doc.md）
      return null;
    },
  },
};

/**
 * 找子模块定义。未登记的 `module` 抛错 —— 页面上的格子是 `LEARNING_MODULES`
 * 渲染出来的，传别的值只可能是代码写错（与 `findHabit` 同一条策略）。
 *
 * @param {string} module 子模块标识
 * @returns {object} 子模块定义
 * @throws {RangeError} `module` 不在 `LEARNING_MODULES` 里
 */
function moduleOf(module) {
  const found = LEARNING_MODULES.find((item) => item.module === module);
  if (!found) {
    throw new RangeError(`学习子模块 ${JSON.stringify(module)} 不在 LEARNING_MODULES 里`);
  }
  return found;
}

/**
 * 找子模块对应的自律任务。按 `module` 找而不是按 id ——
 * 那五条任务的 `id` 与 `module` 取值恰好相同，但那是 data/defaultHabits.js 的巧合，
 * 不是约定（家长端 P7 可以增删任务）。
 *
 * @param {object} save 存档
 * @param {string} module 子模块标识
 * @returns {object} 任务定义
 * @throws {RangeError} 没有对应任务
 */
function habitOf(save, module) {
  const habits = Array.isArray(save.habits) ? save.habits : [];
  const habit = habits.find((item) => item.module === module);
  if (!habit) {
    throw new RangeError(`habits 里没有 module 为 ${JSON.stringify(module)} 的任务`);
  }
  return habit;
}

/**
 * 当天的 `learning` 子对象。没有记录时给一个空对象，读取方不必判空。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object} module -> 记录
 */
function learningOf(save, key) {
  const learning = save.days?.[key]?.learning;
  return typeof learning === 'object' && learning !== null ? learning : {};
}

/**
 * 某个子模块今天打过卡没有。判据是 `checks`（`HABIT` 区的不变式：键存在即已打卡），
 * 不是 `learning` 里有没有记录 —— 记录与打卡状态只能有一个真相。
 *
 * 找不到对应任务时返回 `false` 而**不抛错**：`listLearning` 在渲染路径上，
 * 家长删掉某条学习任务后抛错等于白屏（AGENTS.md 第 5 节第 6 条）。
 * 提交路径的严格由 `habitOf` 负责。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} module 子模块标识
 * @returns {boolean}
 */
function isDone(save, key, module) {
  const habits = Array.isArray(save.habits) ? save.habits : [];
  const habit = habits.find((item) => item.module === module);
  if (!habit) return false;

  const checks = save.days?.[key]?.checks;
  return typeof checks === 'object' && checks !== null && habit.id in checks;
}

/**
 * 学习入口页的唯一读取入口。页面不判断 `page` 是不是空串、不数 `done`
 * （AGENTS.md 第 3 节：页面里不写判断）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {{ items: object[], done: number, total: number }}
 */
export function listLearning(save, key) {
  const items = LEARNING_MODULES.map((item) => ({
    module: item.module,
    name: item.name,
    icon: item.icon,
    desc: item.desc,
    page: item.page,
    // page 为空串 = 这一格还没做，翻成 ready 交给页面
    ready: item.page !== '',
    done: isDone(save, key, item.module),
  }));

  return {
    items,
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}

/**
 * 表单初值：打过卡的回显存档里的内容，没打过的给默认值。
 *
 * 返回的是**表单形状**（`words` / `sentences` 是字符串），不是存档形状（数组）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} module 子模块标识
 * @returns {object} 表单初值
 * @throws {RangeError} 未登记的 `module`
 */
export function learningLog(save, key, module) {
  moduleOf(module);
  const form = FORMS[module];
  const record = learningOf(save, key)[module];

  if (typeof record !== 'object' || record === null) return { ...form.emptyForm };
  return form.toForm(record);
}

/**
 * 能不能打卡：返回**原因码**而不是布尔值，页面按原因选提示语，
 * 校验规则不回到页面里（与 `petState().feedBlock` 同一套约定）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} module 子模块标识
 * @param {object} form 当前表单
 * @returns {'done' | 'noTitle' | null} 阻塞原因，`null` 表示可以打卡
 * @throws {RangeError} 未登记的 `module`
 */
export function learningBlock(save, key, module, form) {
  moduleOf(module);
  if (isDone(save, key, module)) return 'done';
  return FORMS[module].block(form ?? {});
}

/**
 * 完成一次学习打卡：写当天记录 → 打卡 → 发货币与流水 → 涨经验（8）与开心度。
 *
 * **打不了卡时原样返回**（对象同一性），不抛错：书名没填、今天已经打过，
 * 都是正常的用户状态，不是编程错误（AGENTS.md 第 5 节第 6 条）。
 *
 * **与线上的偏差：打过卡之后不能再改记录。** 线上重复提交会把记录合并改写，
 * 这里第二次原样返回 —— 与 `check` / `checkAndAward` / `feed` 同构，
 * 页面靠 `next === this.save` 判断要不要落盘（理由见 doc.md）。
 *
 * 记录里**不存 `at`**：打卡时刻已经在 `checks[habitId].at` 里。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @param {string} module 子模块标识
 * @param {object} form 表单内容
 * @param {number} now 毫秒时间戳，由页面层传入
 * @returns {object} 新存档；打不了卡时返回入参本身
 * @throws {RangeError} 未登记的 `module` 或没有对应任务
 * @throws {TypeError} `now` 非有限数
 */
export function completeLearning(save, key, module, form, now) {
  moduleOf(module);
  const habit = habitOf(save, module);
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
  if (learningBlock(save, key, module, form)) return save;

  const day = save.days?.[key] ?? {};
  // 先写记录再打卡：checkAwardAndGrow 会往同一个 day 上追加 checks 与 ledger，
  // 顺序反了会用旧的 day 覆盖掉它们（LEARN-10）
  const logged = {
    ...save,
    days: {
      ...save.days,
      [key]: {
        ...day,
        learning: { ...learningOf(save, key), [module]: FORMS[module].toRecord(form) },
      },
    },
  };

  return checkAwardAndGrow(logged, key, habit.id, now, EXP_PER_LEARNING);
}
