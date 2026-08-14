/**
 * 六个阶段与 30 道题：数学模块的内容资产，零逻辑（AGENTS.md 第 3 节）。
 *
 * 来源：线上工作台 <https://xiaoluzhu.net/> 的 index-VUOSJfWA.js —— 数学的内容
 * 线上**不在单独的数据包里**，是 bundle 内的两个常量数组，机械转写而来。
 * 逐条数过的事实见 docs/features/math/doc.md「线上的题库」。
 *
 * **字段值一字不改**，与 data/characters.js / data/poems.js 同一条纪律。
 * 与古诗那份的差别：古诗订正了一处（p68 的 dynasty），这里**零订正** ——
 * 线上那道 `m2-2`「8、5、9 从大到小」看着像答错，其实是**判定**错了
 * （`sort` 走字符串比较的旁路，恒按升序比），它的 `answer: 0` 指向 `9,8,5`、
 * 与题目一致，本来就是对的。判定统一走 `answer` 下标比较之后这个缺陷自己消失。
 *
 * **唯一的改动是补齐 `isBoss`**：线上只有 6 道 Boss 带这个字段，普通题**没有这个键**，
 * 靠 `!x.isBoss` 的 falsy 判断工作。本仓库给 30 条全部补上（普通题落 `false`），
 * 因为 `data/` 要能被逐字段读，「有的对象没这个键」会让每个读取点都写 `?? false`。
 * **这是补齐，不是改值。**
 *
 * **顺序本身是规格，不许排序、不许把 Boss 挪到末尾。** 线上的 Boss **不总是最后一条**
 * （阶段 1 的 Boss 排在数组第三位），而每天出哪两道普通题是按这个顺序取的
 * —— 重排会换掉孩子明天看到的题。Boss 由 utils/math.js 追加到第三道，
 * 与它在数组里的位置无关。
 *
 * `count` 题的 `items` / `target` 在本仓库**降级成插图参数**（「上面画几个苹果」）：
 * 线上「点满 target 个自动判对」的交互恒答对，不搬，孩子改点选项。
 * 代价是 `count` 与 `choice` 的交互没有区别 —— 取舍写在 doc.md 里。
 */

/**
 * @type {{ stage: number, name: string, desc: string }[]}
 * 六个阶段，`stage` 1 ~ 6。`name` 上标题、`desc` 上副标题
 */
export const MATH_STAGES = [
  { stage: 1, name: '数感', desc: '认识数量，比较多少' },
  { stage: 2, name: '比较排序', desc: '从小到大，比大小' },
  { stage: 3, name: '图形空间', desc: '认识图形与空间' },
  { stage: 4, name: '10以内加减', desc: '10以内加减法' },
  { stage: 5, name: '20以内加减', desc: '20以内加减法' },
  { stage: 6, name: '钟表人民币', desc: '认识时间和钱币' },
];

/**
 * @type {{ id: string, stage: number, isBoss: boolean, kind: string, title: string,
 *          question: string, options: string[], answer: number, items?: string,
 *          target?: number, leftSide?: object, rightSide?: object, sequence?: number[] }[]}
 * 30 条，顺序即规格。每阶段 5 条 = 4 普通 + 1 Boss
 */
export const MATH_ROUNDS = [
  {
    id: 'm1-1',
    stage: 1,
    isBoss: false,
    kind: 'count',
    title: '数一数',
    question: '点一点有几个苹果？',
    items: '🍎',
    target: 3,
    options: ['2', '3', '4'],
    answer: 1,
  },
  {
    id: 'm1-2',
    stage: 1,
    isBoss: false,
    kind: 'compare',
    title: '选出更多',
    question: '哪边星星更多？',
    leftSide: { label: '左边', items: '⭐', count: 2 },
    rightSide: { label: '右边', items: '⭐', count: 4 },
    options: ['左边', '右边'],
    answer: 1,
  },
  // 线上这条排在阶段 1 的第三位而不是末尾 —— 顺序照搬，Boss 的位置由 math.js 决定
  {
    id: 'm1-boss',
    stage: 1,
    isBoss: true,
    kind: 'compare',
    title: '🏆 数感 Boss',
    question: 'Boss 关：哪边苹果更多？',
    leftSide: { label: '左边', items: '🍎', count: 3 },
    rightSide: { label: '右边', items: '🍎', count: 7 },
    options: ['左边', '右边'],
    answer: 1,
  },
  {
    id: 'm1-3',
    stage: 1,
    isBoss: false,
    kind: 'count',
    title: '数一数',
    question: '点一点有几只小兔？',
    items: '🐰',
    target: 4,
    options: ['3', '4', '5'],
    answer: 1,
  },
  {
    id: 'm1-4',
    stage: 1,
    isBoss: false,
    kind: 'choice',
    title: '比多少',
    question: '5 和 3 哪个更大？',
    options: ['5', '3', '一样'],
    answer: 0,
  },
  {
    id: 'm2-1',
    stage: 2,
    isBoss: false,
    kind: 'sort',
    title: '从小到大',
    question: '下面哪组是从小到大？',
    sequence: [3, 1, 2],
    options: ['1,2,3', '3,2,1', '2,1,3'],
    answer: 0,
  },
  // 线上这条看着像答错，其实是判定错了（见头注释）：answer: 0 指向 9,8,5，与题目一致
  {
    id: 'm2-2',
    stage: 2,
    isBoss: false,
    kind: 'sort',
    title: '从大到小',
    question: '8、5、9 从大到小是？',
    sequence: [8, 5, 9],
    options: ['9,8,5', '5,8,9', '8,9,5'],
    answer: 0,
  },
  {
    id: 'm2-3',
    stage: 2,
    isBoss: false,
    kind: 'choice',
    title: '中间数',
    question: '2、4、6 中间那个数是？',
    options: ['2', '4', '6'],
    answer: 1,
  },
  {
    id: 'm2-4',
    stage: 2,
    isBoss: false,
    kind: 'choice',
    title: '比大小',
    question: '7 和 10 谁更小？',
    options: ['7', '10', '一样'],
    answer: 0,
  },
  {
    id: 'm2-boss',
    stage: 2,
    isBoss: true,
    kind: 'sort',
    title: '🏆 排序 Boss',
    question: 'Boss 关：5、2、8、1 从小到大是？',
    sequence: [5, 2, 8, 1],
    options: ['1,2,5,8', '8,5,2,1', '2,1,5,8'],
    answer: 0,
  },
  {
    id: 'm3-1',
    stage: 3,
    isBoss: false,
    kind: 'match',
    title: '认图形',
    question: '选出三角形 🔺',
    options: ['🔺', '⚪', '⬜'],
    answer: 0,
  },
  {
    id: 'm3-2',
    stage: 3,
    isBoss: false,
    kind: 'match',
    title: '认图形',
    question: '选出正方形 ⬜',
    options: ['🔺', '⚪', '⬜'],
    answer: 2,
  },
  {
    id: 'm3-3',
    stage: 3,
    isBoss: false,
    kind: 'match',
    title: '认图形',
    question: '选出圆形 ⚪',
    options: ['🔺', '⚪', '⬜'],
    answer: 1,
  },
  {
    id: 'm3-4',
    stage: 3,
    isBoss: false,
    kind: 'match',
    title: '找相同',
    question: '和 🔵 一样都是圆的是？',
    options: ['⚪', '🔺', '⬜'],
    answer: 0,
  },
  {
    id: 'm3-boss',
    stage: 3,
    isBoss: true,
    kind: 'compare',
    title: '🏆 图形 Boss',
    question: 'Boss 关：哪边圆形更多？',
    leftSide: { label: '左边', items: '⚪', count: 2 },
    rightSide: { label: '右边', items: '⚪', count: 5 },
    options: ['左边', '右边'],
    answer: 1,
  },
  // 阶段 4 与阶段 5 的十道题 answer 全是 1 —— 「永远点第二个」在线上是必胜策略，
  // 本仓库靠 utils/math.js 按 dayKey 打乱选项化解，数据不动（doc.md 第四处偏离）
  {
    id: 'm4-1',
    stage: 4,
    isBoss: false,
    kind: 'choice',
    title: '10以内加',
    question: '2 + 3 = ?',
    options: ['4', '5', '6'],
    answer: 1,
  },
  {
    id: 'm4-2',
    stage: 4,
    isBoss: false,
    kind: 'choice',
    title: '10以内减',
    question: '7 - 2 = ?',
    options: ['4', '5', '6'],
    answer: 1,
  },
  {
    id: 'm4-3',
    stage: 4,
    isBoss: false,
    kind: 'choice',
    title: '10以内加',
    question: '4 + 4 = ?',
    options: ['7', '8', '9'],
    answer: 1,
  },
  {
    id: 'm4-4',
    stage: 4,
    isBoss: false,
    kind: 'choice',
    title: '10以内减',
    question: '9 - 3 = ?',
    options: ['5', '6', '7'],
    answer: 1,
  },
  {
    id: 'm4-boss',
    stage: 4,
    isBoss: true,
    kind: 'choice',
    title: '🏆 加减 Boss',
    question: 'Boss 关：6 + 4 = ?',
    options: ['9', '10', '11'],
    answer: 1,
  },
  {
    id: 'm5-1',
    stage: 5,
    isBoss: false,
    kind: 'choice',
    title: '20以内加',
    question: '8 + 5 = ?',
    options: ['12', '13', '14'],
    answer: 1,
  },
  {
    id: 'm5-2',
    stage: 5,
    isBoss: false,
    kind: 'choice',
    title: '20以内减',
    question: '15 - 7 = ?',
    options: ['7', '8', '9'],
    answer: 1,
  },
  {
    id: 'm5-3',
    stage: 5,
    isBoss: false,
    kind: 'choice',
    title: '20以内加',
    question: '9 + 6 = ?',
    options: ['14', '15', '16'],
    answer: 1,
  },
  {
    id: 'm5-4',
    stage: 5,
    isBoss: false,
    kind: 'choice',
    title: '20以内减',
    question: '18 - 9 = ?',
    options: ['8', '9', '10'],
    answer: 1,
  },
  {
    id: 'm5-boss',
    stage: 5,
    isBoss: true,
    kind: 'choice',
    title: '🏆 20以内 Boss',
    question: 'Boss 关：13 + 8 = ?',
    options: ['20', '21', '22'],
    answer: 1,
  },
  {
    id: 'm6-1',
    stage: 6,
    isBoss: false,
    kind: 'choice',
    title: '认识钟表',
    question: '短针指3长针指12是几点？',
    options: ['3点', '12点', '15点'],
    answer: 0,
  },
  {
    id: 'm6-2',
    stage: 6,
    isBoss: false,
    kind: 'choice',
    title: '认识钟表',
    question: '短针指6长针指12是几点？',
    options: ['6点', '12点', '18点'],
    answer: 0,
  },
  {
    id: 'm6-3',
    stage: 6,
    isBoss: false,
    kind: 'choice',
    title: '认识人民币',
    question: '1个10元+1个5元=？',
    options: ['10元', '15元', '20元'],
    answer: 1,
  },
  {
    id: 'm6-4',
    stage: 6,
    isBoss: false,
    kind: 'choice',
    title: '认识人民币',
    question: '2个5元=？',
    options: ['5元', '10元', '15元'],
    answer: 1,
  },
  {
    id: 'm6-boss',
    stage: 6,
    isBoss: true,
    kind: 'choice',
    title: '🏆 生活数学 Boss',
    question: 'Boss 关：1个10元+2个5元+1个1元=？',
    options: ['20元', '21元', '22元'],
    answer: 1,
  },
];
