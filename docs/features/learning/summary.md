# 学习（阅读 + 英语）· 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/utils/learning.js`、`miniprogram/data/learningModules.js`、
  `miniprogram/pages/learning/`、`miniprogram/pages/reading/`、`miniprogram/pages/english/`
  （各四个文件）、`miniprogram/app.json`（三个 pages + tabBar 第三项）、
  `miniprogram/utils/pet.js`（`checkAwardAndGrow` 第五参数）、`tests/learning.test.js`、
  `docs/glossary.md`、`docs/features/pet/doc.md`（签名一行）
- 规格：`LEARN-01` ~ `11`、`READ-01` ~ `08`、`ENG-01` ~ `07`（26 条）
- 门禁：`npm run check` 全绿（6 份 doc.md，128 条规格，137 个测试）

## 实现要点

**一条打卡链、两张规范化表，`FORMS[module]` 是唯一的分支点。** 阅读与英语的差别全部
收在那张表的四个成员里（`emptyForm` / `toRecord` / `toForm` / `block`），
`completeLearning` 里没有一处 `if (module === 'reading')`。第三个模块（数学）落地时
加的是表里的一项，不是链上的一支。

**存档层一行没改。** `days[dayKey]` 长出 `learning` 兄弟键，`normalizeSave` 对 `days`
整体透传（`SAVE-11` 早就钉住），所以本轮没有新增 `SAVE` / `IMPORT` 规格 ——
这是 `docs/features/habit/doc.md` 当初预留形状带来的直接收益。

**`completeLearning` 里唯一容易写错的地方是两步的顺序：**

```js
const day = save.days?.[key] ?? {};
const logged = { ...save, days: { ...save.days, [key]: { ...day, learning: {...} } } };
return checkAwardAndGrow(logged, key, habit.id, now, EXP_PER_LEARNING);
```

必须先写记录、再打卡。反过来的话 `checkAwardAndGrow` 已经往 `day` 上追加的
`checks` 与 `ledger` 会被这里那个旧 `day` 的展开覆盖掉。`LEARN-10` 就是为它存在的：
断言三个兄弟键在一次打卡后同时在位。

**经验 8 是调用方传进去的，`pet.js` 不认识 `habitId`。** `checkAwardAndGrow` 加了
第五参数 `gainedExp = EXP_PER_CHECK`，默认值就是自律打卡的 5，所以
`pages/home/home.js` 一行没改，`PET-15` / `MOOD-01` / `MOOD-04` 断言的仍是 5。
这个做法是 `docs/features/pet/summary.md` 在 P4 收尾时先一步定下的，本轮照办。

**渲染宽容、提交严格，在同一个文件里分成两个查找。** `listLearning` / `isDone` 找不到
对应任务时返回 `false`，`habitOf`（只被 `completeLearning` 用）抛 `RangeError`。
两半都被 `LEARN-11` 钉住。家长端（P7）能删任务，入口页因此不能因为少了一条就白屏 ——
与 `petState` 宽容 / `choosePet` 严格是同一条取舍。

## 与 `doc.md` 的偏差

**只有一处，而且是加东西：多导出了 `ENG_OPTIONS`。** `doc.md` 起初只写了导出
`READ_OPTIONS` 给阅读页的选择行用。写英语页时发现跟读次数的加减器需要同一个 10：
页面上按得出 11 而存档里落 10，就是「按钮与收敛对不上」，正是导出 `READ_OPTIONS`
想避免的那种不一致。于是补了 `ENG_OPTIONS`（`{ readAloudMin, readAloudMax }`），
并把 `doc.md` 那一段改成两个常量一起说。收敛的权威仍在 `toRecord`（`ENG-04` 不变）——
页面夹一次只是让按钮到边界不再动，不是第二处规则。

除此之外没有偏离。四个函数的签名、原因码 `'done'` / `'noTitle'` / `null`、
表单形状与存档形状的分工、记录里不存 `at`、第二次提交原样返回、入口页顺序按
`sortOrder`、不存封面、tabBar 插在中间且不用图片图标，都与 `doc.md` 一致。

## 三个页面的两处约定

**两个表单页用 `onLoad` 取初值，入口页用 `onShow`。** 前者不是 tab 页，`navigateTo`
进来只 `onLoad` 一次；放在 `onShow` 会在从别处返回时把填了一半的表单重置回存档内容。
后者是 tab 页，切回来时那一格的「已完成」必须跟着变，所以只能是 `onShow`。
这条差异写在两处的注释里，也补进了 `doc.md`。

**按钮不 `disabled`，只降透明度。** 与 `pages/pet/` 的喂食按钮同一条：禁用掉就没有
「为什么不能」的反馈了。已打过卡时按钮变灰但仍可点，点了弹
「今天已经打过阅读卡啦 📖」—— 文案在页面，规则在 `learningBlock`。

**两个表单页的 WXSS 有一套相同的 `card` / `field` / `submit`，没有抽到 `app.wxss`。**
全局样式表现在只放 CSS 变量与 reset，为两个页面把表单排版提上去，会让第三个表单页
默认继承一套它未必要的东西。两处相同不算重复，三处才是 —— 数学 / 识字页出现时，
如果还是这套，那时再提。这个判断记在 `english.wxss` 的头注释里。

## 对后续 feature 的影响

- **余下三个子页（`LITERACY` / `POEM` / `MATH`）接的是同一条链。** 各自要做的是：
  在 `data/learningModules.js` 里把 `page` 从空串填上、在 `FORMS` 里加一项、
  自己那个区的规格表。`completeLearning` / 发放 / 幂等 / 经验 8 都不必再碰。
  它们真正的工作量在内容侧（2000 字 / 169 首的数据包、30 道题与六阶段升阶、复习调度），
  不在打卡侧。
- **`learningProgress` 顶层键仍然没有。** 阅读 / 英语相关的那三个字段在线上就是死字段
  （见 `doc.md` 范围外）。识字 / 国学 / 数学的复习调度确实要跨天累计状态，
  届时由它们各自的 feature 定义存档结构并扩 `IMPORT` 映射表 —— 顺序是先改
  `docs/features/storage/doc.md`，再动代码。
- **P3-b 的缺口从 8 条少到 7 条。** `reading` 有了打卡入口。`literacy` 还差一个页面，
  `exercise` / `vegetables` / `poop` / `bath` 等 P6。今日全勤的判定本身仍在 `POINT` 区，
  本轮没碰。
- **打卡后不能改记录，这条会被家长追问。**「读完又多读了 5 分钟」现在只能重开一天。
  真要能改，做法是 P7 家长端的每日报告里给一个编辑入口（那里天然有「保存」按钮，
  不依赖对象同一性判断要不要落盘），不是在孩子的打卡页上放二次提交。
- **首页仍不显示学习进度。** `dayProgress` 的分母仍只数 `category === 'habit'`。
  学习完成度在学习 tab 的「今天 N/5」那一行。要合并到首页得先回答
  「五个学习格子算不算今天的任务」，那是产品判断，不是实现细节。
