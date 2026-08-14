# 积分与流水

- 区名：`POINT`（星光 / 宝石 / 宠物粮 / 勋章的产出与消耗）
- 模块：`miniprogram/utils/point.js`
- 状态：已完成（见 `summary.md`）。P3-b 追加了今日全勤与周奖励
  （`POINT-20` ~ `POINT-31`），并把私有的 `post` 导出成 `postLedger`
- 关联愿景：`docs/vision.md` P3

## 背景

P2 的首页能打卡了，但打卡只改 `days[dayKey].checks`，货币一分不涨 ——
`docs/features/habit/doc.md`「范围外」第 1 条刻意留下的过渡态。本 feature 把它接上。

线上的对应实现（从 bundle 逆向，已核对）：

| 项       | 线上做法                                                                     |
| -------- | ---------------------------------------------------------------------------- |
| 费率     | `pointRules` 按 category：`habit` 1⭐1🍖、`learning` 2⭐2🍖、`health` 1⭐1🍖 |
| 发放     | `Do(...)`：加币 → 加宠物经验（`exp: 5`）→ 追加一条 `earn` 流水               |
| 扣回     | `Oo(...)`：`Math.max(0, 币 - 量)` → 追加一条 `spend` 流水                    |
| 流水     | `dailyRecords[日期键].ledger` 数组，元素含 `id` / `at` / `type` / `reason`   |
| 勋章产出 | 只有两处：今日全勤 +1、成就解锁 +1。打卡本身不产出勋章                       |
| 勋章消耗 | 家长批准兑换时扣（`approveExchange`）                                        |

## 设计

### 产出费率：读任务自身的字段，不做 `pointRules`

**这是与线上的偏差。** 线上 `xr(task, pointRules)` 按 `task.category` 去查
`pointRules` 的三档费率；任务自身的 `starsReward` / `foodPointsReward` 只在家长端
新建任务时被写入，**没有任何读取点** —— 是死字段。

本仓库反过来：`starReward` / `petFoodReward` 是唯一的产出来源，不引入 `pointRules`。

| 理由         | 说明                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| 数值等价     | 18 条默认任务的字段值与线上三档费率逐条一致，今天两种算法结果完全相同                        |
| 不动存档结构 | 引入 `pointRules` 要改 `SAVE` 区的白名单与规格表；读任务字段一行代码都不用改 `utils/save.js` |
| 就地可解释   | 「这一项 +1⭐」的依据在任务自己身上，不必跨到另一个顶层键去查 —— 对应愿景「什么算好」第 5 条 |
| 消掉死字段   | `habits` 里躺着两个永不读取的字段，是下一个人的陷阱                                          |

代价：家长端（P7）改产出值变成**按任务改**，而不是改三档费率。18 条各自改比改 3 档繁琐，
但也更细 —— 「自己穿衣」和「按时起床」的难度本来就不一样。P7 若要批量改，
遍历 `habits` 写值即可，不需要新的存档字段。

**一个已知的导入后果**：`importOnlineSave` 不接 `pointRules`（见
`docs/features/storage/doc.md`）。如果家长在线上改过三档费率，导入后产出会回到
`defaultHabits.js` 里转抄的那份值，而不是家长改过的值。

### 流水条目（`days[dayKey].ledger` 的元素）

```js
{
  at: 1754880000000,   // 发生时刻，毫秒数
  type: 'earn',        // earn | spend
  reason: '完成：按时起床',
  star: 1,             // 四个币种恒定存在，没有变动的填 0
  gem: 0,
  petFood: 1,
  medal: 0,
}
```

**与线上的三处偏差：**

1. **没有 `id`。** 线上的 `id` 是 `` `${Date.now()}-${Math.random()...}` ``，只用来当
   React 列表的 key。`utils/` 不许调 `Date.now()` 也不该调 `Math.random()`（都不是纯函数），
   而流水是只追加、不删改、不按 id 查的，数组下标就是它的身份。WXML 里 `wx:key="index"`。
2. **`at` 是毫秒数，不是 ISO 字符串。** 按 `docs/glossary.md`「时间」。
3. **四个币种字段恒定存在，值是非负的量，方向由 `type` 给。** 线上缺失的币种是
   `undefined`，于是每个读取点都要 `?? 0`。这与 `HABIT` 区「不留墓碑」是同一条取舍：
   让结构成为不变式，而不是让每个读取点各自防御。

`days[dayKey]` 上 `checks` 与 `ledger` 是兄弟键，互不覆盖。

### `utils/point.js` 的四个纯函数

```js
checkAndAward(save, dayKey, habitId, now)   -> save   // 打卡 + 发放，幂等
uncheckAndRefund(save, dayKey, habitId, now)-> save   // 取消 + 扣回，幂等
ledgerOf(save, dayKey)                      -> entry[] // 当天流水，发生顺序
dayEarned(save, dayKey)                     -> { star, gem, petFood, medal } // 当天净额
```

**打卡与发放合成一个函数，不留给页面两步走。** `habit/summary.md` 里我建议过
「页面先 `check` 再发放」，实际写的时候改了主意：两步走意味着页面可以只做一步，
于是「每条 `checks` 项都有一条对应的 `earn` 流水」这个不变式没有任何东西保证它。
合成一个函数后，不变式由 `point.js` 独占维护。

`point.js` 依赖 `habit.js`（同层 import，无环），`habit.js` 不知道 `point.js` 存在 ——
所以 `HABIT-01` ~ `HABIT-17` 全部不受影响，打卡本身仍可独立测试。

**幂等靠对象同一性判断，不重新做一遍判断**：

```js
const next = check(save, dayKey, habitId, now);
if (next === save) return save; // check 已打过卡时原样返回，说明什么都没发生
```

`habit.check` 幂等时返回的是入参本身（`HABIT-06` 钉住了这件事），
所以 `next === save` 就是「这次没有新打卡」的可靠信号，不必再调一次 `isChecked`。

### 扣回按当前任务定义重算，不记录发放时的数额

`uncheckAndRefund` 扣的是**此刻**任务定义上的 `starReward` / `petFoodReward`，
与线上一致（线上也是取消时重新查一遍费率）。

已知边界：家长在孩子打卡之后改了这一项的产出值，当天取消打卡会按**新值**扣。
另一种做法是打卡时把数额写进 `checks[habitId]`，取消时照数退 —— 那要改 `HABIT` 区
定下的 `checks` 结构。P7 落地家长端编辑时再评估，现在不为它改结构。

**扣到 0 就停（`Math.max(0, ...)`），不出现负数。** 线上同样。
副作用是货币已经花掉时，取消打卡会少扣 —— 宁愿少扣也不倒扣，
对应愿景「什么算好」第 2 条「温和，不惩罚」。少扣的痕迹留在流水里（`spend` 记的是
应扣的量，货币记的是实扣的结果），两者不一致时以流水为账、货币为余额。

### 首页接上货币

`pages/home/` 顶部加一条货币带：`⭐ n` `🍖 n`。打卡后 `wx.showToast` 提示
`太棒啦！+1⭐`。宝石与勋章暂不显示 —— 打卡产不出它们，显示恒为 0 的数字是噪音。

**P3-b 起四种全显示**（`⭐ 🍖 🏅 💎`）：今日全勤与成就产出勋章、周奖励产出宝石，
两者不再恒为 0。详见 `docs/features/reward/doc.md`。

### 今日全勤与周奖励：两处新的货币产出（P3-b）

P3-a 的「范围外」第 1 条把它们推给了 P5 / P6 之后。核心打卡项现在全都有入口，
本节补上。**判定与结算的编排在 `docs/features/reward/doc.md` 的 `settleDay`**，
本区只定义这两笔产出本身的数额、去重水位与流水文案。

```js
WEEKLY_BONUS = { star: 5, gem: 1, minDays: 5 }

listCore(save)                       -> habit[] // 启用中的核心项（core 为真）
coreDone(save, key)                  -> number  // 当天完成了几条核心项
isQualifiedDay(save, key)            -> boolean // 达标日：完成 ≥ minDays 条
awardAllDone(save, key, now)         -> save    // 今日全勤，水位 bonuses.allDone
awardWeeklyBonus(save, key, now)     -> save    // 周奖励，水位 lastWeeklyBonusWeek
```

| 项       | 规则                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 今日全勤 | 当天核心项全部完成 → `+1🏅`，流水 `今日全勤`，去重水位 `days[key].bonuses.allDone` |
| 达标日   | 当天核心项完成 ≥ 5 条（分母是**启用中的**核心项）                                  |
| 周奖励   | 本周七天里达标 ≥ 5 天 → `+5⭐ +1💎`，流水 `本周打卡 5 天达标`                      |
| 周去重   | 顶层键 `lastWeeklyBonusWeek` 存 `weekKeys(now)[0]`（`SAVE-14`）                    |

**核心项名单落在任务自己的 `core` 字段上**，不是 `utils/` 里的独立数组 ——
线上 `rr` 与 `tasks` 各存一份，家长删掉 `poop` 之后全勤永久不可能达成。
这与本区「读任务自身的 `starReward` 而不查 `pointRules`」是同一条判断。
名单为什么是七条（去掉了线上的 `bath`）见 `docs/features/reward/doc.md`。

**`isQualifiedDay` 是导出的**：`full-week` 成就要用同一个函数（见 `ACHV-09`）。
`listCore` / `coreDone` 也导出，页面顶部要显示「本周达标 N/5 天」。
`awardAllDone` 与 `awardWeeklyBonus` 各自看自己的水位，重复调用原样返回入参 ——
`settleDay` 因此可以每次打卡都调一遍。

**分母跟着启用状态变**：家长停用某条核心项时它不计入，剩下几条打满即全勤
（与 `dayProgress` 同一条）。七条全被停用时**不算全勤** —— 否则空存档天天全勤。

**全勤后取消一项打卡，勋章不退、水位不清。** 与「取消打卡不收回宠物经验」同一条，
也是「温和，不惩罚」的直接推论。代价是当天「打满 → 取消 → 再打满」只发一次勋章，
而这正是 `bonuses.allDone` 这个水位存在的理由。

**达标日的判据只有一个函数**，周奖励与 `full-week` 成就共用它。线上那两套口径
（核心项 5/8 与「自律 + 学习的 60%」）算同一件事却能给出不同答案。

### `post` 导出成 `postLedger`（P3-b）

```js
postLedger(save, key, type, amount, reason, now) -> save
```

P3-b 新增四处货币变动（全勤、周奖励、成就解锁、兑换），都不在本模块里。
导出一个「原始」函数看着比 `checkAndAward` 那种成对封装弱，但它换来一条更强的不变式：
**`save.currency` 只可能被 `point.js` 改**，而它每次改都追加一条流水。
四处各自 `{ ...save, currency }` 才是真的危险 —— 那会让账与余额悄悄分叉。

内部实现一行不改，`checkAndAward` / `uncheckAndRefund` 仍走同一个函数，
所以 `POINT-01` ~ `POINT-19` 全部不受影响。

## 行为规格

### 发放

| Spec ID  | 输入                                             | 期望输出                                                                 |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| POINT-01 | `checkAndAward(save, '2026-08-12', 'wake', now)` | `currency.star` +1、`currency.petFood` +1                                |
| POINT-02 | 同上                                             | `days['2026-08-12'].ledger` 追加 `{ type: 'earn', star: 1, petFood: 1 }` |
| POINT-03 | 同上，且 `reason`                                | `'完成：按时起床'`（`完成：` + 任务名）                                  |
| POINT-04 | 对同一项连续两次 `checkAndAward`                 | 幂等：货币不变、流水仍只有一条                                           |
| POINT-05 | `learning` 类的 `literacy` 打卡                  | `star` +2、`petFood` +2（读任务自身字段）                                |
| POINT-06 | `checkAndAward` 后检查传入的 `save`              | 未被改动（返回的是新对象）                                               |
| POINT-07 | 打卡同时                                         | `days[dayKey].checks` 也被写入（`isChecked` 为 `true`）                  |

### 扣回

| Spec ID  | 输入                                                      | 期望输出                                               |
| -------- | --------------------------------------------------------- | ------------------------------------------------------ |
| POINT-08 | `uncheckAndRefund` 已打卡的 `wake`                        | `star` -1、`petFood` -1，且 `checks.wake` 被删         |
| POINT-09 | 同上                                                      | 流水追加 `{ type: 'spend', reason: '取消：按时起床' }` |
| POINT-10 | 货币已是 0 时 `uncheckAndRefund`                          | 货币收敛到 0，不出现负数；流水仍记应扣的量             |
| POINT-11 | `uncheckAndRefund` 没打过卡的项                           | 原样返回，货币与流水都不变                             |
| POINT-12 | `checkAndAward` / `uncheckAndRefund` 传不存在的 `habitId` | 抛 `RangeError`                                        |
| POINT-13 | `now` 非有限数                                            | 抛 `TypeError`                                         |

### 流水与查询

| Spec ID  | 输入                              | 期望输出                                    |
| -------- | --------------------------------- | ------------------------------------------- |
| POINT-14 | `ledgerOf` 一个 `days` 里没有的键 | 返回 `[]`                                   |
| POINT-15 | 打卡两项后 `ledgerOf`             | 两条，按发生顺序（先打的在前）              |
| POINT-16 | 当天已有 `checks` 时打卡          | `checks` 与 `ledger` 互不覆盖，两者都在     |
| POINT-17 | 打卡后又取消，`dayEarned`         | 四个币种都是 0                              |
| POINT-18 | 打了两项 `habit` 后 `dayEarned`   | `{ star: 2, gem: 0, petFood: 2, medal: 0 }` |
| POINT-19 | `dayEarned` 传另一天的键          | 不把别的日期的流水算进来                    |

### 今日全勤与周奖励（P3-b）

| Spec ID  | 输入                                                | 期望输出                                                               |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| POINT-20 | 七条核心项全部打上后结算                            | `medal` +1，流水追加 `{ type: 'earn', medal: 1, reason: '今日全勤' }`  |
| POINT-21 | 同上                                                | `days[key].bonuses.allDone` 为 `true`                                  |
| POINT-22 | 只打上六条核心项后结算                              | 不发勋章、无流水、`bonuses` 不产生                                     |
| POINT-23 | 已全勤后再结算一次                                  | 原样返回入参（水位挡住），勋章仍只 +1                                  |
| POINT-24 | 全勤后取消一项打卡，再结算                          | 勋章不退、`bonuses.allDone` 仍为 `true`；重新打满不再发第二枚          |
| POINT-25 | `poop` 被家长停用（`enabled: false`）时打满其余六条 | 算全勤（分母跟着启用状态变）                                           |
| POINT-26 | 七条核心项全被停用                                  | **不算**全勤，不发勋章                                                 |
| POINT-27 | 打上九条非核心项（`brush-pm` `dress` …）            | 不算全勤 —— 判据是核心项，不是「全部打卡项」                           |
| POINT-28 | 本周五天达标后结算                                  | `star` +5、`gem` +1，流水 `本周打卡 5 天达标`                          |
| POINT-29 | 同上                                                | `lastWeeklyBonusWeek` 为 `weekKeys(now)[0]`（本周周一的日期键）        |
| POINT-30 | 某天核心项只完成四条                                | 那天不算达标日；本周达标四天时不发周奖励                               |
| POINT-31 | 本周已发过周奖励后再结算                            | 原样返回（`lastWeeklyBonusWeek === 本周周键`）；跨到下周一后可再发一次 |

`POINT-24` 与 `POINT-31` 是两个水位各自的规格：一个在 `days[key].bonuses`（按天），
一个在顶层 `lastWeeklyBonusWeek`（按周）。两者都写成「原样返回」而不是「不变」——
断言的是对象同一性，页面靠它决定不落盘。

`POINT-27` 挡住一个容易写错的方向：`dayProgress` 数的是 `category === 'habit'` 的九条，
全勤数的是跨三个 category 的七条 `core`，两者没有包含关系。

## 范围外

- ~~**不做今日全勤（`allDone`）与周奖励。**~~ **P3-b 已做**（`POINT-20` ~ `POINT-31`）。
  原先的理由是：两者都要求核心 id 里凑够 5 条以上，其中 `literacy` / `reading` 要 P5 的学习页、
  `exercise` 等要 P6 的健康页才可能被打上，那时实现它们等于写一段不可能被触发的代码
  （`AGENTS.md` 第 5 节第 4 条）。P5 / P6 落地后核心 id 全都有了入口，这条限制随之解除。
  名单从线上的八条收敛成七条（去掉 `bath`），理由见 `docs/features/reward/doc.md`。
- **不做宠物经验与心情。** 线上打卡同时 `exp += 5`、`happiness + 1`（上限 5），
  升级阈值 `petLevel × 100`。那是 `PET` / `MOOD` 区的规则，P4 做。
  `checkAndAward` 现在**不碰 `save.pet`** —— P4 接的时候在 `point.js` 之外包一层，
  不要把升级循环塞进发放函数。
- ~~**不做兑换与成就。**~~ **P3-b 已做**，在 `docs/features/reward/doc.md`（`REWARD` / `ACHV` 两区）。
  本区仍只定义勋章在流水里怎么记与两处产出的数额；兑换的状态流转、成就的十一条判据不在这里。
- **不做流水的界面。** 首页只显示货币余额与一句 toast。完整流水列表（家长端每日报告）
  在 `PARENT`（P7）。
- **不做 `pointRules` 的导入。** 见上文「一个已知的导入后果」。
- **不做流水的裁剪或归档。** 每天一个数组，一天最多 18 条，不会涨到需要清理的量级。
