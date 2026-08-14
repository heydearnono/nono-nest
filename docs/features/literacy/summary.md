# 识字（2000 字库 + 复习调度）· 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/data/characters.js`（新增，2000 条）、
  `miniprogram/utils/literacy.js`（新增）、`miniprogram/pages/literacy/`（四个文件）、
  `miniprogram/utils/dayKey.js`（新增 `dayKeyAfter`）、`miniprogram/utils/save.js`
  （`learningProgress` 默认值与收敛）、`miniprogram/utils/importOnline.js`（线上五结构映射）、
  `miniprogram/data/learningModules.js`（识字那格的 `page` 填上）、`miniprogram/app.json`
  （一个 page，不加 tab）、`tests/literacy.test.js`（新增）、`tests/dayKey.test.js`、
  `tests/save.test.js`、`tests/importOnline.test.js`、`tests/learning.test.js`（`LEARN-02`）、
  `docs/glossary.md`、`docs/features/storage/doc.md`、`docs/features/learning/doc.md`、
  `eslint.config.mjs` 与 `.prettierignore`（`.scratch/` 忽略）
- 规格：`LITERACY-01` ~ `26`，加存储层的 `DAY-10` ~ `12`、`SAVE-13`、`IMPORT-11`（31 条）
- 门禁：`npm run check` 全绿（8 份 doc.md，183 条规格，196 个测试）

## 实现要点

**一个字一条记录，替掉线上五个平行结构。** `chars[字] = { step, due, wrong }` 让
glossary 的四个状态都从这一条推出来，于是线上那三个 bug 不是「防住了」而是
**表达不出来**：没有第二个列表能与 `mastered` 同时含一个字，没有只写不读的字段，
错误数只有一处加减。

**间隔表真的当间隔用（本轮最大的偏离）。** 线上一次评分写六个到期日、判定是
`some(d <= 今天)`，最早那个永远说话 —— 实际间隔恒为 1 天，学过的字每天都回到
上限 8 的队列，到第 20 个字以后老字再也轮不到。本仓库存一个 `due` 加一个 `step`，
`LITERACY-05` 逐档钉住 +1 / +2 / +4 / +7 / +14 / +30。

**`step` 是「连着答对了几次」，不是间隔表的下标。** 这是实现时对 `doc.md` 的一处修正
（见下一节）：`1` ~ `6` 各对应一个间隔，`7` 是已掌握，`0` 空出来表示「上次答错、今天重来」。
拿下标当档位的话 `0` 要同时表示「刚学的」与「刚答错的」，就得再加一个字段区分。

**两个队列的取法只有一份（`queues`）。** `literacyState` 与 `gradeChar` 共用它 ——
打卡改判要问「还有没有新字、到期的字复习完没有」，问的必须是同一套判据。
第一版 `gradeChar` 靠回调 `literacyState` 来问，但那时 `days` 里还是评分**前**的记录，
刚评的字没被排除，「没什么可做了」这一支永远走不到。抽出 `queues` 之后两处传的都是
评分后的 `chars` 与 `graded`。

**发放先行、记录后写**（P6 的做法）：`day` 从 `awarded` 里取，`checks` / `ledger` /
`learning` 三个兄弟键不可能互相覆盖。`completeLearning` 是反的，那里得靠 `LEARN-10` 守着。

**打卡补了一条改判，挡住 2000 天后的死角。** 线上 2000 字学完之后新字池空、
`newChars` 永远到不了 2，识字这一格再也打不了卡。本仓库：没有新字可学时，
复习完当天到期的全部字即打卡（`LITERACY-26`）。

**`emoji` 没有搬进 `data/`。** 已验证 2000 条全部满足 `emoji === CHAR_EMOJI[i % 15]`，
它是下标的函数不是数据。`% 15` 落在 `utils/literacy.js`，页面拿到的卡片已经带着 emoji。

## 与 `doc.md` 的偏差

**一处，而且是 `doc.md` 自相矛盾，改的是 `doc.md`。** 初稿的设计段写
「`due = dayKeyAfter(now, REVIEW_STEPS[新 step])`」而 `LITERACY-04` 写
「第一次答对 `due` 是**明天**」—— 按下标算第一次答对会等 2 天，两句话对不上。
按 `AGENTS.md` 第 5 节第 2 条（先改文档）把 `step` 的语义定成「连续答对次数」：
`REVIEW_STEPS[step - 1]`、上界从 `6` 变 `7`。连带改了 `SAVE-13` / `IMPORT-11`
的夹取上界与「已掌握」的取值（`step: 7`），以及 glossary 里 `step` 的一句释义。
这处矛盾是**写测试时才暴露的** —— 规格表里两行分开看都成立，只有把它们放进同一个
断言才会打起来。

**`.scratch/` 进了两个忽略表。** ESLint 扁平配置不再自动跳过点目录，所以
`npm run check` 会去 lint 线上那三个 minified bundle，报 531 条 `no-undef`。
`eslint.config.mjs` 与 `.prettierignore` 各加一行 —— 与 `.gitignore` 里那条同一个理由：
那是别人的产物，不是本仓库的源码。这不是识字域的事，但它挡着门禁，本轮顺手做了。

**`LEARN-02` 改了一个字。** 它原来断言「只有阅读与英语 `ready`」，识字那格亮起来之后
这句话不再成立。改成「识字 / 阅读 / 英语 `ready`，国学 / 数学为 `false`」，
`learning/doc.md` 的状态行与 `page` 那一段也跟着标了识字已落地。

除此之外没有偏离。字库一个字不改（含 1107 条空例句、9 条拼音矛盾）、顺序一条不动、
新字按语料顺序从头取、复习队列 `wrong` 降序 + 语料顺序 + `slice(0, 8)`、当天去重、
`gradeChar` 一个函数收两种评分、经验 8 点、`literacyState` 宽容 / `gradeChar` 严格，
都与 `doc.md` 一致。

## 数据包的核对结果

生成脚本与一份**独立重解析**的校验脚本（都只在 `/tmp`，不入库）给出的数字与
`doc.md`「线上的字库」一节逐项相符：

```
{ 条数: 2000, 空例句: 1107, 空组词: 1111, 模板句: 699, 组词总数: 1717 }
前五: 的 一 是 在 不 | 第 415 起: 飞 阿 啊 哎 哀
✓ 与原始数据包逐条一致，emoji 全部可由下标推出
```

Prettier 定型后 158 KB，远低于 2 MB 主包上限，不需要分包。
「前 415 条字频序、其后拼音序」在 `doc.md` 与 `data/characters.js` 头注释里各记一次 ——
**顺序本身是规格**，重排会毁掉教学序列。

## 页面的三处约定

**一次只显示一张卡，页面不维护「翻到第几张」。** 评过的字当天不再进任何队列，
所以评完重算状态，下一张自然顶上来。没有下标就没有「删掉当前项后下标越界」这类状态。

**「还不太会」不是灰色的否定按钮。** 它和「我认识」一样大、一样是渐变色（蓝对粉）——
答错只是安排明天再见，不是惩罚（`docs/vision.md`「什么算好」第 2 条）。

**组词与例句缺就不占位。** 一半的字没有这两行（1111 / 1107 条），给占位符等于每张卡
都有一块空白在提醒「这里少了东西」。

## 对后续 feature 的影响

- **P3-b 的 8 条核心 id 齐了。** `brush-am` / `wake` 在 P2、`reading` 在 P5 首段、
  `exercise` / `vegetables` / `poop` / `bath` 在 P6、`literacy` 在本轮。
  今日全勤判定与勋章发放本身仍在 `POINT` 区，是 P3-b 的事。
- **50 字勋章数的会是真认识的字。** `mastered` 要熬过 58 天，比线上（点一次即掌握）
  慢得多。P3-b 做那个勋章时要知道：它在真实使用里第 59 天才可能出现第一个。
- **`POEM` 那一轮不复用这套调度，只复用术语。** 已核对线上：古诗按周轮换 3 首、
  到期上限 2、只在首次学习时写一次调度、没有错误计数。`glossary.md` 里那句
  「共用同一套调度」本轮已改成「共用同一套**术语**」。古诗要在
  `learningProgress` 下加自己的子键，不新增顶层键。
- **`learningProgress` 的位置定了。** 跨天的学习进度都进这个顶层键，本层收敛
  （`SAVE-13`）；当天做了什么进 `days[key].learning`（`days` 整体透传）。
  国学与数学照这个分工加自己那份。
- **`dayKeyAfter` 是时间原语，已经在 `DAY` 区。** 古诗的排期要的是同一个东西。
- **导入路径仍然没有调用方。** `importOnline.js` 现在能把线上的识字进度映射进来了
  （`IMPORT-11`），但全仓依旧零 importer —— nono 线上的进度要等 P7 家长端才真能搬。
  这是目前影响最大的一个缺口。
- **不做的仍然不做。** 笔画笔顺（数据包里没有字段）、语音跟读（P8 才评估）、
  每日新字数可配（P7）、已掌握重学、取消识字打卡、首页显示识字进度。
