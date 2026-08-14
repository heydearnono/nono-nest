# 数学（30 道题 + 六阶段 + Boss 通关）· 实施清单

顺序按依赖：先补存储层（`math` 子键的默认值、收敛与导入映射），再术语与既有文档，
再数据包，再纯函数与测试，最后页面与入口页那一格。
`math.js` import `pet.js` / `dayKey.js` / `data/`，反向不许；
`reward.js` **不许** import `math.js`（会成环，所以判据只读 `rounds` 的 `correct`）。

## 1. 存储层先行（`AGENTS.md` 第 5 节第 2 条）

- [x] `docs/features/storage/doc.md`：加「数学的进度与当前阶段」一节、
      `SAVE-18` / `IMPORT-15`，并改「只加 literacy 一个子键」那段与「不接」名单那两段
- [x] `miniprogram/utils/save.js`：`mathProgress(raw)` —— `rounds` 元素收敛
      （`correct` 只认布尔、`wrong` 非负整数、非对象整条丢掉），`stage` 夹 `1`~`6`
- [x] `defaultSave()` 里加 `math: { rounds: {}, stage: 1 }`
- [x] **不加第三个上界常量**，改加一个阶段数常量（`MATH_STAGE_MAX = 6`），
      头注释写清「这是阶段数不是档位，数学没有间隔表」
- [x] `miniprogram/utils/importOnline.js`：`mathFromOnline` ——
      只接 `currentStage` → `stage`，另外三个次数字段不接，`rounds` 落空对象
- [x] `tests/save.test.js` 补 `SAVE-18`
- [x] `tests/importOnline.test.js` 补 `IMPORT-15`，并改那条断言
      `Object.keys(result.learningProgress)` 为 `['literacy', 'guoxue', 'math']`

## 2. 术语与既有文档

- [x] `docs/glossary.md`：`mathStage` / `mathRound` 两条补上本仓库的定义
      （关卡是「30 道固定题之一」，`correct` 是终态），学习调度一节写明
      **数学不进 `step` / `due`**（第三个 feature 不复用这两个词）
- [x] `docs/features/learning/doc.md`：状态行、`LEARN-02` 的期望改成「五格全 `ready`」、
      `page` 空串那段散文、范围外那两条划掉
- [x] `docs/features/reward/doc.md`：`math-10` 那一行的判据从
      `learningProgress.math?.games` 改成「`rounds` 里 `correct` 为真的数」，
      并改下面那段「两条依赖还没做的模块」的散文
- [x] `MATH` 区名早已登记，不重复加

## 3. 数据包

- [x] 写 `miniprogram/data/mathRounds.js`：`MATH_STAGES` 6 条 + `MATH_ROUNDS` 30 条
- [x] 30 条全部补上 `isBoss`（普通题 `false`）—— 补齐不是改值
- [x] 头注释记下：字段值一字不改、`isBoss` 为什么补齐、`m2-2` 的矛盾靠判定统一化解
      （数据本来就是对的）、`count` 的 `items` / `target` 降级成插图参数
- [x] 校验：30 条、每阶段 5 条（4 普通 + 1 Boss）、`id` 形状、`answer` 都是合法下标

## 4. `math.js` 两个纯函数

- [x] 写 `miniprogram/utils/math.js`：`mathState` / `answerRound`
- [x] 出题 helper 一个函数：当前阶段的普通题里优先取没答对过的，取两道，Boss 追加末尾
- [x] 不够两道时用已答对过的补（按数据包顺序），**不跨阶段借题**（线上那条分支是死代码）
- [x] 升阶 helper 一个函数：本阶段 5 道题（含 Boss）都 `correct` 即 `stage + 1`，上限 6
- [x] 确定性打乱：种子只吃 `dayKey` 与题 id，种子化 Fisher-Yates，给出
      `options` 与 `answerIndex`
- [x] `correct` 是终态（答对过之后再答错不退回），`wrong` 累加
- [x] 当天已答过的题原样返回（对象同一性），仍留在三道里并标 `answered`
- [x] 打卡条件是「当天答满 3 道」，走 `checkAwardAndGrow(..., 8)`，答错也算
- [x] 发放先行、记录后写（`checks` / `ledger` / `learning` 三兄弟键互不覆盖）
- [x] 当天记录是 `{ rounds: ['m1-1'], correct: 1 }`，不搬线上那个死的 `stage`
- [x] `mathState` 不抛错（脏 `stage` 收敛、脏 id 挑掉、矛盾时以 `stage` 为准）；
      `answerRound` 严格（未登记 id / 缺任务 / 非法 `choice` 抛 `RangeError`、
      `now` 抛 `TypeError`）
- [x] `answerRound` 只返回存档，**不返回第二个值** —— 升阶由页面比较前后 `stage`

## 5. 测试

- [x] 写 `tests/math.test.js`，覆盖 `MATH-01` ~ `MATH-36`
- [x] `MATH-01` / `MATH-02` 断言数据包本身（30 条、每阶段 5 条、`answer` 合法）
- [x] `MATH-05` / `MATH-06` 是偏离线上最要紧的一对：答对过的题让位
- [x] `MATH-07` / `MATH-08` 一起钉确定性打乱（少一条就能被蒙过）
- [x] `MATH-15` / `MATH-35` 断言对象同一性（`toBe`）
- [x] `MATH-16` / `MATH-17` 钉「Boss 也算在 5 道里」
- [x] `MATH-23` 断言三道全答错照样打卡照样发放
- [x] `MATH-32` 造 `stage` 与 `rounds` 矛盾的存档，断言以 `stage` 为准
- [x] `MATH-36` 造十道答对的题，断言 `math-10` 解锁（`reward.js` 改一行判据）
- [x] 按 `AGENTS.md` 第 13 条：`mathState` 的规格断言读取入口的输出，
      水位类（`stage`）的规格断言存档里落了什么
- [x] `LEARN-02` 的断言改成「五格 `ready` 全为 `true`」
- [x] `tests/reward.test.js` 的 `ACHV-06`：补一段数学的断言（造几道答对的题）

## 6. 页面与入口

- [x] `miniprogram/pages/math/` 四个文件
- [x] 顶部：「阶段 N/6 · 数感」+ `desc` + 「本阶段 N/5 · 今天 N/3」+ 今天打过卡的 ✅
- [x] 一次一道题：题干 + 插图（`count` 画 `target` 个 `items`、`compare` 画两边、
      `sort` 排开 `sequence`）+ 选项按钮；Boss 金色描边
- [x] 答对「太棒啦！⭐」/ 答错「再试一次哦～」，1.5 秒后切下一道
- [x] 进度条：三个圆点（对 / 错 / 未答）+ 六个阶段胶囊
- [x] 空态「今天的三道题都做完啦 🎉」
- [x] 升阶 toast 与打卡 toast 排队，不互相覆盖（页面比较前后 `stage`）
- [x] `onLoad` 取初值（`navigateTo` 进来），答题后 `setData` 重渲染，落盘前判同一性
- [x] `miniprogram/data/learningModules.js`：`math` 的 `page` 填 `pages/math/math`
- [x] `app.json` 加 page（不加第五个 tab）

## 7. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 P7 的影响
- [x] `docs/vision.md`：P5 的状态从「进行中」改成「已完成」，补数学那一段与四处偏离
- [x] 留档本次 prompt 到 `prompts/runs/`
