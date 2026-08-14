# 古诗（169 首 + 每周三首 + 会背判定）· 完成总结

- 完成日期：2026-08-13
- 实际改动：`miniprogram/data/poems.js`（新增，169 条 / 44 KB）、
  `miniprogram/utils/poem.js`（新增）、`miniprogram/pages/poem/`（四个文件）、
  `miniprogram/utils/save.js`（`learningProgress.guoxue` 默认值与收敛，档位上界拆成两个常量）、
  `miniprogram/utils/importOnline.js`（线上三结构映射）、
  `miniprogram/data/learningModules.js`（国学那格的 `page` 填上）、`miniprogram/app.json`
  （一个 page，不加第五个 tab）、`tests/poem.test.js`（新增）、`tests/save.test.js`、
  `tests/importOnline.test.js`、`tests/reward.test.js`（`ACHV-06`）、
  `tests/learning.test.js`（`LEARN-02`）、`docs/glossary.md`、
  `docs/features/storage/doc.md`、`docs/features/learning/doc.md`、
  `docs/features/literacy/doc.md`（范围外两条划掉）
- 规格：`POEM-01` ~ `32`，加存储层的 `SAVE-17` / `IMPORT-14`（34 条）
- 门禁：`npm run check` 全绿（10 份 doc.md，265 条规格，12 个测试文件 / 279 个测试）
- **`miniprogram/utils/reward.js` 一行没改** —— `poem-10` 成就自己就亮了（见下文）

## 实现要点

**一首诗一条记录，替掉线上三个平行结构。** `poems[id] = { step, due, wrong, mastered }`
让 glossary 的四个状态都从这一条推出来。线上 `learnedPoems` / `masteredPoems` /
`reviewSchedule` 三张表能互相矛盾（一首诗同时在「学过」与「会背」里、
调度表里留着已会背的诗），这里表达不出来。

**间隔表真的当间隔用。** 线上一次写六个到期日、判定 `some(d <= 今天)`，而且那份调度
是 `||=` 写的 —— **这辈子只在首次学习时写过一次**，比识字那份还死（识字至少在掌握时
重写）。本仓库存一个 `due` 加一个 `step`，`POEM-08` 逐档钉住 +1 / +3 / +7 / +15。

**四档 26 天，不是照识字的六档 58 天。** 古诗每周引入 3 首、识字每天 2 个字，
复习压力差近五倍，档位可以更疏。`docs/features/literacy/summary.md` 承诺过
「`POEM` 那一轮不复用这套调度，只复用术语」，本轮兑现的方式是两个模块各有一份
`REVIEW_STEPS` 与各自的 `MASTERED_STEP`（`7` 与 `5`），共用的只有 `step` / `due` /
`wrong` 三个词的语义与 `dayKeyAfter` 这个时间原语。

**`save.js` 的档位上界因此拆成两个常量**（`STEP_MAX = 7` / `POEM_STEP_MAX = 5`），
头注释记下「两个 feature 的档位表不同」。`SAVE-17` 里 `step: 99 → 5` 就是钉这件事的：
夹到 `7` 说明两张表被混成了一张，而那样古诗永远算不到会背。

**选诗只有一个 helper（`pickWeekly`）。** `studyPoem` 落盘与 `poemState` 读到过期
`weekKey` 时当场重算，共用的是同一个函数 —— `POEM-30` 断言两者给出的 id 序列相同。
与识字抽出 `queues` 同一条：共用判据要共用的是函数，不是两处抄一样的规则。

**`weekly` 是水位，不是快照。** 「顺序取未学的三首」是 `poems` 键集的纯函数，
不落盘也算得出来，但那样周一学完 `p1`、周二列表就变成 `p2`/`p3`/`p4`，学一首冒一首。
落盘让这三首在一周内固定。写入方只有 `studyPoem`（动手前先刷一次），
所以整周没学过诗的那些周从不落盘，读取路径当场重算、不写存档。

**`poemState` 不从存档读 `mastered`。** `poemsOf` 只收 `step` / `due` / `wrong` 三个
字段，`mastered` 一律照 `step >= 5` 现算 —— 读取路径因此不可能被一个矛盾的落盘值毒到
（`POEM-28`）。它仍是**存档字段**，因为 `reward.js` 的 `poems_mastered` 判据不能
import `poem.js`（`poem.js → pet.js → reward.js`，反过来成环）。写入方每次同时写两个。

**`poem-10` 成就是零改动亮起来的。** `tests/reward.test.js` 的 `ACHV-06` 补了一段：
造三首 `mastered: true` 的诗，断言 `poem-10` 的进度变成 3。`docs/features/reward/summary.md`
承诺「两个子键一出现就自动亮起来、古诗那一轮不必回头改 `ACHV`」，这条断言是履约凭证。

**POEM-20（当天第二首不重复发放）没有写任何守卫。** 第二次表态照样走
`checkAwardAndGrow` → `checkAndAward` → `check`，而 `check` 对重复打卡返回入参本身，
发放就被既有的同一性契约跳过了。断言的是结果（`star` 仍 2、`petExp` 仍 8、流水仍一条），
不是实现。

**发放先行、记录后写**（P6 起的做法）：`day` 从 `awarded` 里取，`checks` / `ledger` /
`learning` 三个兄弟键不可能互相覆盖（`POEM-21`）。

**两个按钮都打卡。** 说「😅 还没背下来」照样发 2⭐2🍖8 经验。谎报的收益因此只剩
「早一点看到会背的数字」，而那个数字要熬 26 天 —— 一天之内谎报不出来。
线上那两个按钮发一样的东西、而「已会背」还白送一首进 `masteredPoems`，谎报严格占优。

## 与 `doc.md` 的偏差

**没有设计上的偏差。** 三处偏离线上的取舍（顺序取未学的三首并落盘、间隔表真的当间隔、
拓展诗有一条走得通的路）与规格表 32 条全部照 `doc.md` 落地，一条没改。
这与识字那一轮不同：那次是写测试时才发现 `doc.md` 自相矛盾，回头改了文档。

**两处文字修订。** `doc.md`「`mastered` 为什么是存档里的字段」一节把仲裁规则引到了
`POEM-27`，而那条规格是「`habits` 里没有国学任务」，仲裁在 `POEM-28` ——
改的是引用。状态行同时从「进行中」改成「已完成」。

**一个实现细节在写测试前自己补上了。** `poemState` 的 `weekly` 最初把已会背的诗留在
列表里，与 `POEM-10`（会背的既不进 `weekly` 也不进 `reviews`）冲突。加了一道
`step < MASTERED_STEP` 的过滤，注释里点明它与 `POEM-04` 的分界：**学过而没会背的
仍留着并标成已学，会背了的退场。** 一周内熬到会背要连着五天表态，罕见但走得到。

**`LEARN-02` 又改了一个字。** 它上一轮改成「识字 / 阅读 / 英语 `ready`」，
国学那格亮起来之后改成「只有数学 `ready` 为 `false`」。`learning/doc.md` 的
规格表原文早已写成「做完一格就改一次这条」，所以文档不用动。

## 数据包的核对结果

生成脚本先**校验后写入**（都只在 `/tmp`，不入库），`doc.md`「线上的诗库」一节
从上一轮逆向得来的三条断言全部成立：

```
169 条；id === 'p' + (下标 + 1) 全部成立；type 169 条全是 'poem'
(grade, tier) 五段的分界正是 p1 / p35 / p75 / p105 / p140
tier: required 109 / extended 60
p68 题西林壁：dynasty 已从 '唐' 改成 '宋'（唐 121/宋 28 → 唐 120/宋 29）
```

`type` 没搬（169 条取值全同、全仓无读取点）。Prettier 定型后 44 KB，
远低于 2 MB 主包上限。**顺序本身是规格**在 `doc.md` 与数据包头注释里各记一次 ——
它就是难度序列，选诗层因此不需要知道 `grade`（与识字「调度层不知道字频」同一条）。

## 页面的三处约定

**一屏两段，同一首诗不出现两次。** 本周三首里今天到期的那首留在原位、加一个
「该复习啦」角标，不在「到期复习」里出现第二次 —— 孩子会以为是两首诗。
`poemState` 用一个 `inWeekly` 集合保证这件事，页面不做去重。

**朝代不拼「代」字。** 显示 `{dynasty} · {author}`，于是数据包里 12 条
`古代` / `先秦` / `北朝` 自然就对了。线上拼 `${dynasty}代${author}` 喂给语音朗读，
读出来是「古代代佚名」「先秦代诗经」—— 这不是修数据，是不做那次拼接。

**「😅 还没背下来」不是灰色的否定按钮。** 与识字页的「还不太会」同一条：
它和「✨ 已会背」一样大、一样是渐变色，答错只是安排明天再见。
表态后的 toast 也分两句（「背下来啦，真棒 ✨」/「没关系，明天再见 😊」）。

## 对后续 feature 的影响

- **P5 只剩数学一格。** 入口页五格里四格已亮，`math-10` 成就进度仍恒 `0`。
  数学那一轮要在 `learningProgress` 下加自己的子键（照 `guoxue` 这份分工），
  不新增顶层键；`data/` 里大概不需要数据包（线上的题是现算的），这是与前两轮的最大不同。
- **`learningProgress` 的分工第三次验证成立。** 跨天的学习进度进这个顶层键、本层收敛；
  当天做了什么进 `days[key].learning`（`days` 整体透传）。数学照抄这条。
- **档位表分家的先例已建立。** 两个 feature 各有 `REVIEW_STEPS` 与 `MASTERED_STEP`，
  `save.js` 各有一个上界常量。数学若要复习调度，是第三份，不是往这两份里挤。
- **P7 家长端的缺口又大了一格。** `importOnline.js` 现在能接线上的识字与古诗进度
  （`IMPORT-11` / `IMPORT-14`），但全仓依旧**零 importer** —— nono 线上的进度
  要等 P7 才真能搬。这仍是目前影响最大的一个缺口。
- **P7 若要做「重学已会背的诗」或「改每周首数」，得先拍板水位怎么迁移。**
  `weekly` 是水位，改「每周几首」不是改一个常量就完事：本周已落盘的那三首怎么算，
  是个产品决定。
- **P8 的语音跟读要用的是 `content` 那个句子数组**，数据包里已经是逐句的，
  页面也已经逐句排开 —— 那一轮不必改数据。
- **不做的仍然不做。** 目录页、点句设当前句、填空默写、诗意讲解、语音跟读、
  已会背重学、取消国学打卡、每周首数与档位表可配、首页显示古诗进度、
  `guoxue` 进核心名单（全勤仍是七条）。
