# 积分与流水

- 区名：`POINT`（星光 / 宝石 / 宠物粮 / 勋章的产出与消耗）
- 模块：`miniprogram/utils/point.js`
- 状态：已完成（见 `summary.md`）
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

## 范围外

- **不做今日全勤（`allDone`）与周奖励。** 两者都要求 8 条核心 id 里凑够 5 条以上
  （`brush-am` `wake` `literacy` `reading` `exercise` `vegetables` `poop` `bath`），
  其中 `literacy` / `reading` 要 P5 的学习页、`exercise` 等要 P6 的健康页才可能被打上。
  现在实现它们等于写一段在 P5 / P6 之前**不可能被触发**的代码，违反
  `AGENTS.md` 第 5 节第 4 条。等这两个页面落地后一起做，届时还要加「周」的键。
  这也意味着 **P3-a 阶段勋章恒为 0**，兑换（`REWARD`）因此还换不了东西。
- **不做宠物经验与心情。** 线上打卡同时 `exp += 5`、`happiness + 1`（上限 5），
  升级阈值 `petLevel × 100`。那是 `PET` / `MOOD` 区的规则，P4 做。
  `checkAndAward` 现在**不碰 `save.pet`** —— P4 接的时候在 `point.js` 之外包一层，
  不要把升级循环塞进发放函数。
- **不做兑换与成就。** `REWARD`（兑换流程与状态流转）、`ACHV`（成就判定）各自成区。
  勋章的**消耗**路径在 `REWARD`，本 feature 只定义勋章字段在流水里怎么记。
- **不做流水的界面。** 首页只显示货币余额与一句 toast。完整流水列表（家长端每日报告）
  在 `PARENT`（P7）。
- **不做 `pointRules` 的导入。** 见上文「一个已知的导入后果」。
- **不做流水的裁剪或归档。** 每天一个数组，一天最多 18 条，不会涨到需要清理的量级。
