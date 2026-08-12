# 自律打卡与首页 · 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/data/defaultHabits.js`、`miniprogram/utils/habit.js`、
  `miniprogram/app.js`、`miniprogram/pages/home/{home.js,home.wxml,home.wxss}`、
  `tests/habit.test.js`
- 规格：`HABIT-01` ~ `HABIT-17`（17 条）
- 门禁：`npm run check` 全绿（3 份 doc.md，48 条规格，55 个测试）

## 实现要点

**默认任务表是一份转抄，不是设计。** 18 条的 id、`sortOrder`、`icon` 逐条对着线上
bundle 核过，一个没改 —— 线上已有的打卡记录是按这些 id 存的。`data/defaultHabits.js`
里零函数零判断，所以按 `AGENTS.md` 第 3 节它不需要自己的测试，
由 `HABIT-01` / `HABIT-03` 间接钉住条数与分类。

**`seedHabits` 深拷一份再塞进存档。** `DEFAULT_HABITS` 是模块级常量，直接引用会让
家长端将来改一条任务时改到常量上，而常量在整个小程序生命周期里是共享的 ——
表现是「改一个孩子的任务，另一处也跟着变」，且重启后又变回来。

**打卡状态用「键存在 == 已打卡」。** `isChecked` 就是一个 `in`，`uncheck` 是 `delete`。
线上留 `{ completed: false }` 墓碑，于是每个读取点都得写 `?.completed`。
删键让 `dayProgress` / `habitStreak` 都能直接用 `habit.id in checks`，
不存在「漏写一个 `?.completed` 就把取消过当成打过卡」这类错误。

**`habitStreak` 用 `setDate(-1)` 回溯，不用 `now - n * 86400000`。**
夏令时切换日只有 23 小时（或 25 小时），减固定毫秒数会跳过或重复一天。
`Date` 自己知道月末与夏令时，所以把日期运算交给它。

## 与 `doc.md` 的偏差

**`doc.md` 的「六个纯函数」小节实际列了七个。** 标题里的数字是写文档时漏改的，
代码里是 7 个（`seedHabits` / `listHabits` / `isChecked` / `check` / `uncheck` /
`dayProgress` / `habitStreak`），与那一节的签名清单一致。

**新增了 `HABIT-17`（`now` 非有限数抛 `TypeError`）。** 写 `check` 时发现
`doc.md` 只规定了未知 `habitId` 抛 `RangeError`，没说非法时间戳怎么办。
不校验的话 `at` 会写进一个 `NaN`，而 `NaN` 序列化进 storage 后变成 `null`，
下次读出来「打过卡」这件事还在、时刻却没了。按第 5 节第 2 条先补规格表再写实现。

**存档读写包装最终落在 `app.js`，与 `doc.md` 一致，但比 `doc.md` 多做了一件事：**
`readSave` 在 `normalizeSave` 之后还过一遍 `seedHabits`。这样「首次启动就有 18 条任务」
不必由每个页面各自负责，页面拿到的存档一定是可渲染的。
代价是 `app.js` 依赖了 `utils/habit.js` —— 可以接受，`app.js` 本来就是适配层。

除此之外没有偏离。函数签名、`days[dayKey].checks` 的结构、30 天上限、
连续天数的语义（至少一项完成）都与 `doc.md` 一致。

## 关于「点了不涨数字」

P2 的首页是**过渡态**：打卡有视觉反馈（边框 + 对勾 + 进度分子变化），
但 `currency` 一分不涨。这是 `doc.md`「范围外」第 1 条的直接后果，不是缺陷。
如果先给孩子看到星星再在 P3 改动发放规则，改动就变成了「扣星星」——
所以宁愿让它先不发。

## 对 `POINT`（P3）的影响

- **发放不塞进 `check` / `uncheck` 内部。** 本层的 `check` 只写 `checks` ——
  把发放塞进去会让 `HABIT-10`（不改入参）与幂等性的断言范围悄悄扩大到积分。
  这条成立，但当时紧接着建议的「页面层先 `check` 再发放」P3 没有采纳：
  两步走意味着页面可以只做一步，「每条 `checks` 项都有一条 `earn` 流水」这个不变式
  就没有东西保证它。P3 的做法是在 `point.js` 里包一层 `checkAndAward`，
  `habit.js` 仍然不知道积分存在（见 `docs/features/point/summary.md`）。
- **`starReward` / `petFoodReward` 已经在存档里了**，18 条都有值，P3 直接读即可，
  不需要再补一次默认表。
- **取消打卡要扣回积分**（线上语义）。`uncheck` 是幂等的、且已打卡才会真的删键，
  所以 P3 可以用「`uncheck` 返回的 `save` 与入参不同一个对象」判断是否真的取消了。
  更稳的做法是先 `isChecked` 再决定扣不扣。
- **今日全勤的 8 条 id 跨三个 category**（`brush-am` `wake` `literacy` `reading`
  `exercise` `vegetables` `poop` `bath`），而 `listHabits` 只返回 `category === 'habit'`
  的 9 条。P3 需要一个不带 category 过滤的取任务方式 —— 建议在 `POINT` 区自己按
  id 数组查 `save.habits`，不要为它放宽 `listHabits`。
- **`ledger` 是 `days[dayKey]` 的兄弟键。** `check` / `uncheck` 用 `{ ...day }` 展开，
  已有的兄弟键会被保留（有一条无标签测试钉住这件事），P3 增补 `ledger` 不会被打卡冲掉。
- **`weeklyTarget: 3` 的 `bath` 还没有周计数。** 周奖励要先有「周」的键，
  和 `POINT` 的周奖励一起做。
