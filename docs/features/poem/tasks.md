# 古诗（169 首 + 每周三首 + 会背判定）· 实施清单

顺序按依赖：先补存储层（`guoxue` 子键的默认值、收敛与导入映射），再术语与既有文档，
再数据包，再纯函数与测试，最后页面与入口页那一格。
`poem.js` import `pet.js` / `point.js` / `dayKey.js` / `data/`，反向不许；
`reward.js` **不许** import `poem.js`（会成环，所以 `mastered` 是存档字段）。

## 1. 存储层先行（`AGENTS.md` 第 5 节第 2 条）

- [x] `docs/features/storage/doc.md`：已加「古诗的进度与本周三首」一节、
      `SAVE-17` / `IMPORT-14`，并改了顶层键清单与「不接」名单那两段
- [x] `miniprogram/utils/save.js`：`guoxueProgress(raw)` —— `poems` 元素收敛
      （`step` 夹 `0`~`5`、`due` 复用 `DAY_KEY_RE`、`wrong` 非负整数、
      `mastered` 照 `step === 5` 现算而不是原样收下）
- [x] `miniprogram/utils/save.js`：`weekly` 收敛（`weekKey` 只认日期键形状、
      `ids` 只留字符串），`defaultSave()` 里加 `guoxue` 子键
- [x] 档位上界拆成两个常量（识字 `7` / 古诗 `5`），头注释记下「两个 feature 的档位表不同」
- [x] `miniprogram/utils/importOnline.js`：`guoxueFromOnline` ——
      `masteredPoems` → `step: 5` / `due: ''` / `mastered: true`；
      `reviewSchedule` → `step: 0` / `due` 取六个日期里最早的；
      `learnedPoems` → `step: 0` / `due: ''`；`wrong` 恒 `0`（线上没有这笔数据）
- [x] `weekly` 不从线上来（线上不落盘），落空水位
- [x] `tests/save.test.js` 补 `SAVE-17`
- [x] `tests/importOnline.test.js` 补 `IMPORT-14`

## 2. 术语与既有文档

- [x] `docs/glossary.md`：学习调度一节补「同样的词、不同的档位表」与 `mastered` 的冗余理由，
      `weekKey` 那段补第三个使用点（全仓只有一个「本周」）
- [x] `docs/features/learning/doc.md`：状态行、`LEARN-02` 的期望、`page` 空串那段散文、
      范围外两条划掉
- [x] `docs/features/literacy/doc.md`：范围外「不做国学」与「不做 169 首数据包」两条划掉
- [x] `POEM` 区名早已登记，不重复加

## 3. 数据包

- [x] 写 `miniprogram/data/poems.js`：169 首，七个字段（`type` 不转抄）
- [x] `p68 题西林壁` 的 `dynasty` 从 `'唐'` 改成 `'宋'`（唯一一处订正）
- [x] 头注释记下：顺序是规格（五段 `(grade, tier)`、`p1/p35/p75/p105/p140` 为界）、
      `type` 为什么不搬、`p68` 改了哪一个字段、两处重复正文与 12 条朝代照搬不修
- [x] 校验 `id` 与下标一一对应（`p1` ~ `p169`），必背 109 / 拓展 60

## 4. `poem.js` 两个纯函数

- [x] 写 `miniprogram/utils/poem.js`：`poemState` / `studyPoem`
- [x] 选诗 helper 一个函数：从池子里按数据包顺序取最前面三首未学的
- [x] `studyPoem` 先刷水位（`weekKey` 与本周不符就重选），`poemState` 读到过期
      `weekKey` 时当场按**同一个 helper** 算一遍（`POEM-30` 钉两者一致）
- [x] 池子默认 `tier === 'required'`；109 首全部 `mastered` 后变成全部 169 首
- [x] `weekly` 与 `reviews` 互不重叠：本周三首里今天到期的留在 `weekly` 且 `dueToday`
- [x] 当天表过态的诗不进 `reviews`，再次 `studyPoem` 原样返回（对象同一性）
- [x] 间隔表 `[1, 3, 7, 15]`，五次表态、`step` 到 `5` 即会背（`due` 置空、`mastered` 置真）
- [x] 说「还没背下来」：`step` 回 `0`、`due` 今天、`wrong + 1`，**照样打卡发放**
- [x] 打卡条件是「当天表过任意一首的态」，走 `checkAwardAndGrow(..., 8)`
- [x] 发放先行、记录后写（`checks` / `ledger` / `learning` 三兄弟键互不覆盖）
- [x] 当天记录是 `{ poems: ['p1'] }` 一个数组，不是线上那个单数
- [x] 卡片带 `gradeLabel` / `tierLabel` / `learned` / `dueToday`，页面不比日期不写 `step === 5`
- [x] `poemState` 不抛错（`now` 非有限数时用落盘的 `ids`、脏 id 挑掉）；
      `studyPoem` 严格（未登记 id 与缺任务抛 `RangeError`、`now` 抛 `TypeError`）

## 5. 测试

- [x] 写 `tests/poem.test.js`，覆盖 `POEM-01` ~ `POEM-32`
- [x] `POEM-16` / `POEM-31` 断言对象同一性（`toBe`）
- [x] `POEM-05` / `POEM-06` 跨周断言：学完的往后走、没学完的留下（这是偏离线上最要紧的一条）
- [x] `POEM-15` 断言同一首诗不在两个列表里出现两次
- [x] `POEM-24` 造一份「109 首必背全部会背」的存档，断言拓展诗解锁且 `weekly` 变成 `p75` 起
- [x] `POEM-28` 造 `mastered` 与 `step` 矛盾的存档，断言以 `step` 为准
- [x] `POEM-30` 断言 `studyPoem` 落盘的 `ids` 与 `poemState` 的 `weekly` 序列相同
- [x] 顺带确认 `ACHV-06` 与 `poems_mastered` 判据：造几首会背的诗，
      断言 `poem-10` 的进度跟着动（`reward.js` 一行不改）
- [x] 按 `AGENTS.md` 第 13 条：`poemState` 的规格断言读取入口的输出，
      水位类（`weekly`）的规格断言存档里落了什么
- [x] `LEARN-02` 的断言改成「只有数学 `ready` 为 `false`」

## 6. 页面与入口

- [x] `miniprogram/pages/poem/` 四个文件
- [x] 顶部：「必背 N/109 · 拓展 N/60」+「会背 N 首」+ 今天打过卡的 ✅
- [x] 本周三首：三张卡，学过的打勾，今天到期的标「该复习啦」
- [x] 到期复习：最多两张，没有时整段不出现
- [x] 卡片：标题 + `朝代 · 作者` + 两个角标 + 逐句排开的正文（不拼「X 代」）
- [x] 两个按钮 `✨ 已会背` / `😅 还没背下来`，两个都会打卡
- [x] 空态「这周的诗都学过啦 🎉」
- [x] `onLoad` 取初值（`navigateTo` 进来），表态后 `setData` 重渲染，落盘前判同一性
- [x] `miniprogram/data/learningModules.js`：`guoxue` 的 `page` 填 `pages/poem/poem`
- [x] `app.json` 加 page（不加第五个 tab）

## 7. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对数学那一轮与 P7 的影响
- [x] `docs/vision.md` 的 P5 那段补一句古诗已完成，并记下三处偏离线上
- [x] 留档本次 prompt 到 `prompts/runs/`
