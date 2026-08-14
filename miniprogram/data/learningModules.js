/**
 * 学习域的五个子模块。
 *
 * 字段结构与来源见 docs/features/learning/doc.md（`LEARN` 区）。
 *
 * 常量区纪律（AGENTS.md 第 3 节）：只有字面量，零函数、零判断。
 *
 * `page` 为空串表示「这一格还没做」，入口页渲染成灰的。用一个字段同时表达
 * 「跳哪里」与「做没做」，而不是再加一个 `ready` 布尔值 —— 两个字段会出现
 * 「ready 为 true 但 page 是空串」的第三种状态，而它没有意义。
 *
 * `icon` 抄的是线上**入口页**那份，不是线上任务表：任务表里英语与识字都是 🔤，
 * 五格列在一起会看到两个一样的图标（见 doc.md）。
 *
 * 顺序按 data/defaultHabits.js 的 sortOrder（10-14），与线上入口页的顺序不同 ——
 * 入口页的顺序与家长端将来的排序是同一个依据，不出现两套顺序。
 */
export const LEARNING_MODULES = [
  {
    module: 'literacy',
    name: '识字',
    icon: '🔤',
    desc: '每天2个新字',
    page: 'pages/literacy/literacy',
  },
  {
    module: 'reading',
    name: '阅读',
    icon: '📖',
    desc: '亲子/独立阅读',
    page: 'pages/reading/reading',
  },
  {
    module: 'guoxue',
    name: '国学',
    icon: '📜',
    desc: '每周3首古诗',
    page: 'pages/poem/poem',
  },
  {
    module: 'math',
    name: '数学',
    icon: '🔢',
    desc: '每天2题+Boss',
    page: 'pages/math/math',
  },
  {
    module: 'english',
    name: '英语',
    icon: '🅰️',
    desc: '斑马英语打卡',
    page: 'pages/english/english',
  },
];
