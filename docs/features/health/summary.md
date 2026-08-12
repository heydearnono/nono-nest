# 健康记录（饮食 · 便便 · 洗澡 · 运动）· 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/utils/health.js`、`miniprogram/pages/health/`（四个文件）、
  `miniprogram/utils/dayKey.js`（新增 `weekKeys`）、`miniprogram/app.json`
  （一个 page + tabBar 第四项）、`tests/health.test.js`、`tests/dayKey.test.js`、
  `docs/glossary.md`、`docs/features/storage/doc.md`（`weekKeys` 一节 + `DAY-06` ~ `DAY-09`）、
  `docs/features/habit/doc.md`（两条「范围外」标注为已落地）
- 规格：`HEALTH-01` ~ `20` 与 `DAY-06` ~ `DAY-09`（24 条）
- 门禁：`npm run check` 全绿（7 份 doc.md，152 条规格，165 个测试）

## 实现要点

**一张 `FIELDS` 表，十一个字段的全部差异都在里面。** 每个字段三样东西：`kind`
（`bool` 走 `toggleHealth`，`count` / `pick` 走 `setHealth`）、`habitId`（非空即发放）、
`turnsOn`（填了值顺带打开哪个开关）。`toggleHealth` 与 `setHealth` 里因此没有一处
`if (field === 'poopIcon')` —— 与 `learning.js` 的 `FORMS[module]` 同一条思路：
**把「这一项有什么特别」收进数据，而不是收进分支。**

**发放先行、记录后写，顺序不再是个隐患。**

```js
const awarded = settle(save, key, meta.habitId, on, now); // 先发放 / 退回
return writeHealth(awarded, key, { [field]: on }); // day 从 awarded 里取
```

`completeLearning` 是反的（先写记录再打卡），那里必须靠 `LEARN-10` 守住顺序，
因为它展开的是入参 `save` 里那个旧 `day`。本区的 `writeHealth` 读的是上一步的输出，
所以顺序错不了。`HEALTH-20` 仍然留着 —— 它是回归防线，不是唯一的保障。

**`bath` 的周计数数 `checks`，不数 `health.bath`。** 线上两个都数
（`t[e]?.health?.bath || t[e]?.completedTasks.bath?.completed`）是历史遗留，
搬过来就等于给自己留一个「两边不一致时听谁的」的问题。`checks` 从 P2 起就是
「做没做」的唯一真相，本区不给它加第二个来源。

**`weekKeys` 放在 `DAY` 区而不是健康域。** 洗澡卡要「本周 N/3」，P3-b 的周奖励要同一份键
（线上 `Rr` 与 `Mr` 共用一个 `mr()`）。实现上锚到中午再逐天推进，夏令时切换那天
加减一天不会跨到别的自然日；周日走 `-6`，否则「周日晚上洗了澡」会算进还没开始的那一周
（`DAY-07` 就是为这个错存在的）。

**`poopIcon` 的越界不收敛、直接抛。** 其它字段（`sugarCount` / `exerciseMinutes`）
越界收敛，`poopIcon` 越界抛 `RangeError`：三个 emoji 是 `healthState` 渲染出来的，
传出第四个只可能是代码写错。而且「随手落一个心情」比「还没选」更容易被家长误读 ——
所以存档里读到坏值时 `healthLog` 把它当**空串**（还没选），不静默改成 😊。
读取宽容、提交严格，在同一个字段上分成两半。

## 与 `doc.md` 的偏差

**只有一处，而且是把一条规格说得更准：`HEALTH-10` 断言的是收敛后的读数。**
`doc.md` 起初把它写成「`sugarCount` 为 `-1` 收敛成 `0`」，实现完发现
`setHealth(save, ..., -1)` 会命中 `HEALTH-15` 的同一性 —— 收敛先算、再比同值，
而记录里本来就是 `0`，所以这一次**不落盘**，`days[key].health` 根本不存在。
两条规格没有冲突（收敛后的读数确实是 `0`），但断言得挑对读法：
用 `healthState().log.sugarCount` 而不是 `days[key].health.sugarCount`。
`doc.md` 因此补了「收敛先算、再比同值」一段，测试里也把这条同一性显式断言了一次。

**顺带回答了 `english.wxss` 留下的那个问题：健康页不是第三个表单页。** 它与两个表单页
只共用一个 `card` 类名 —— 没有提交按钮（点开关即落盘），也没有 `field--col` 那套
标签 + 输入框的竖排版。所以 `app.wxss` 仍然只放变量与 reset，那条注释原样留着等数学 /
识字页。判断记在 `health.wxss` 的头注释里。

除此之外没有偏离。三个函数的签名、两个写入口的分工、`turnsOn` 做成表里一项而不是两处
`if`、蕴含只打开不关闭、周目标只显示不设门禁、缺任务时 `bathWeek` 为 `null`、
经验不传第五参数、tabBar 第四个 tab 且不用图片图标，都与 `doc.md` 一致。

## 页面的两处约定

**没有提交按钮，点一下就落盘。** 四张卡片上全是开关与取值，没有「填完再交」这一步 ——
这与两个学习表单页正相反。所以页面每次事件都走 `commit(next)`，靠
`next === this.save` 挡住无变化的写入；数字输入框每敲一下触发一次，挡住它的是
`setHealth` 的同一性（`HEALTH-15`），不是页面里的防抖。

**提示语按货币差额出，不按字段判断。** `commit` 只看 `next.currency.star - this.save.currency.star`：
正数说「记下啦 +N⭐」，负数说「取消了」，零就不弹。页面因此不需要知道哪四个字段发放 ——
这与首页那个 `gained` 是同一段代码形状。

## 对后续 feature 的影响

- **P3-b 只差 `literacy` 一条了。** 今日全勤那 8 条核心 id 里，`brush-am` / `wake` 在 P2、
  `reading` 在 P5 首段、`exercise` / `vegetables` / `poop` / `bath` 在本轮，
  只剩 `literacy` 要等识字页。全勤判定与勋章发放本身仍在 `POINT` 区，本轮没碰。
- **周奖励的另一半已经就位。** `weekKeys` 是 P3-b 判断「这周发过没有」要用的那份键，
  按周一起点定好了。剩下要加的是 `lastWeeklyBonusWeek` 那个存档字段（届时改
  `docs/features/storage/doc.md` 的映射表）与 60% / 5 天的规则。
- **`weeklyTarget` 有了第一个读取点，但仍不是门禁。**「一周只发 3 次洗澡」会引出
  「第 4 次要不要给星星」，那是产品判断。真要做，做法是在 `POINT` 区给周任务一条
  独立的发放规则，不是在健康域里加一个计数上限。
- **健康数据没有累计与趋势。**「这周吃了几次青菜」「平均运动多少分钟」全都能从
  `days` 里算出来，但读取点要等 P7 家长端的每日报告 —— 本轮只写当天记录。
- **首页仍不显示健康进度。** `dayProgress` 的分母仍只数 `category === 'habit'`。
  健康完成度在健康 tab 里，与学习同一条。要合并到首页得先回答「四个健康格子算不算
  今天的任务」，那是产品判断。
