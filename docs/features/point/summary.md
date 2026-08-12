# 积分与流水 · 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/utils/point.js`、`miniprogram/utils/habit.js`（导出 `findHabit`）、
  `miniprogram/pages/home/{home.js,home.wxml,home.wxss}`、`tests/point.test.js`
- 规格：`POINT-01` ~ `POINT-19`（19 条）
- 门禁：`npm run check` 全绿（4 份 doc.md，67 条规格，75 个测试）

## 实现要点

**费率读任务自身字段，没有引入 `pointRules`。** 这是与线上最大的偏差，理由在 `doc.md`
的表里。落地后的实际收益是 `utils/save.js` 一行没改 —— 存档结构不动，`SAVE` 区的
11 条规格全部不受影响。

**打卡与发放合成 `checkAndAward` 一个函数。** `habit/summary.md` 里我建议过让页面
「先 `check` 再发放」，写的时候改了主意：两步走意味着页面可以只做一步，
于是「每条 `checks` 项都有一条 `earn` 流水」这个不变式没有任何东西保证它。
已回头把那条建议改掉了。

**幂等靠对象同一性，不重新判断一遍：**

```js
const checked = check(save, key, habitId, now);
if (checked === save) return save;
```

`HABIT-06` 钉住了「`check` 幂等时返回入参本身」，所以这个判断是可靠的，
而且比再调一次 `isChecked` 少一次查找。`uncheckAndRefund` 反过来用了显式的
`isChecked` —— 因为它要在 `uncheck` 之前就知道该不该扣，两者不对称是有意的。

**货币加减集中在 `post()` 一个地方**，`earn` 加、`spend` 用 `Math.max(0, ...)` 收敛。
四个币种走同一个循环，所以将来周奖励要发宝石时，`post` 不用改。

**流水的四个币种字段恒定存在。** 与 `HABIT` 区「不留墓碑」是同一条取舍：
让结构成为不变式，而不是让每个读取点各自 `?? 0`。代价是每条流水多存两个 0，
一天最多 18 条，不值得为此省字节。

## 与 `doc.md` 的偏差

**`uncheckAndRefund` 多收了一个 `now` 参数并自己校验它。** `doc.md` 的签名里有 `now`，
但 `HABIT` 区的 `uncheck` 是不收 `now` 的（取消打卡不需要时刻）。这里需要 `now`
是因为**流水条目要记发生时刻** —— 取消也是一笔账。校验放在 `uncheckAndRefund` 里
而不是依赖 `uncheck`，因为 `uncheck` 根本不看时间。

**导出了 `habit.js` 的 `findHabit`（原本是私有的 `requireHabit`）。** 发放要读任务上的
`starReward` / `petFoodReward`，让 `point.js` 自己再写一遍查找与抛错会出现两套
「未知 id」的行为。改名是因为 `require` 在 JS 里有另一层含义，容易读成模块加载。
`docs/features/habit/doc.md` 的函数清单已同步更新为八个。

**`findHabit` 不看 `enabled`，所以停用的任务仍可被发放。** 正常路径下点不到
（首页只渲染 `listHabits` 的结果），但这是一个语义决定而非疏漏：「停用」的含义是
「不出现在首页」，不是「打了也不算」。加了一条无标签测试钉住它。

除此之外没有偏离。流水结构、`reason` 文案、扣到 0 就停、四个函数的语义都与 `doc.md` 一致。

## 一个刻意的不一致：流水与货币可以对不上

货币已经花掉时取消打卡会少扣（`Math.max(0, ...)`），但流水仍记**应扣**的量。
于是「把当天流水加总」不等于「货币余额的变化」。

这不是 bug，是两个不同的东西：**流水是账，货币是余额**。
账要如实记录发生了什么（这一笔应该扣 1 星），余额要遵守「不倒扣」
（`docs/vision.md`「什么算好」第 2 条）。`POINT-10` 同时断言了两边，
就是为了让后来的人不会把它「修」成一致。

`dayEarned` 因此算的是**账面净额**，不是余额变化。首页显示的是
`save.currency`（余额），不是 `dayEarned` —— 家长端的每日报告（P7）才需要账面数。

## 对后续 feature 的影响

- **`PET`（P4）在 `point.js` 之外包一层。** 线上打卡同时 `exp += 5` 且
  `happiness + 1`（上限 5），升级阈值 `petLevel × 100`（`Dr(e) => e * 100`）。
  `checkAndAward` 现在完全不碰 `save.pet`。P4 应当写
  `checkAwardAndGrow(save, ...)` 之类的外层函数，不要把升级循环塞进发放函数 ——
  升级是个 `while`，塞进去会让 `POINT-01` 的断言范围扩大到宠物等级。
- **勋章此刻恒为 0，所以 `REWARD` 还换不了东西。** 勋章的两个产出点（今日全勤、
  成就解锁）都在范围外，见下。兑换的**消耗**路径在 `REWARD`，本区只定义了
  勋章字段在流水里怎么记（`medal: 1`、`type: 'earn'`、`reason: '今日全勤（8项打卡满）'`）。
- **今日全勤与周奖励等 P5 / P6。** 线上判定用 `rr` 这 8 条核心 id
  （`brush-am` `wake` `literacy` `reading` `exercise` `vegetables` `poop` `bath`）：
  全勤要 8 条**全打满**（`every`）奖 1 勋章，周奖励要一周内「打满 5 条以上」的天数
  ≥ 5 天，奖 5 星 + 1 宝石且每周只发一次（靠 `lastWeeklyBonusWeek` 记周键）。
  其中 `literacy` / `reading` 要 P5 的学习页、`exercise` / `vegetables` / `poop` / `bath`
  要 P6 的健康页才可能被打上，现在做等于写一段不可能被触发的代码。
  届时还要给存档加一个「上次发过周奖励的周键」字段 —— 那是 `SAVE` 区要改的。
- **周奖励要「周」的键。** 线上的周键是 `mr()` 返回的周一到周日七个 `dayKey` 里的第一个
  （周日按 `-6` 回退，即周一为一周之始）。做的时候放进 `DAY` 区，不要在 `POINT` 里
  自己算一遍星期。
