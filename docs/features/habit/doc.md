# 自律打卡与首页

- 区名：`HABIT`（自律任务与打卡）
- 模块：`miniprogram/utils/habit.js`、`miniprogram/data/defaultHabits.js`、`miniprogram/pages/home/`
- 状态：已完成（见 `summary.md`）
- 关联愿景：`docs/vision.md` P2

## 背景

P1 只保证 `days` 与 `habits` 能「原样存、原样取」，两者的内部结构留给第一个用到它们的
feature 定义 —— 就是这里（见 `docs/features/storage/summary.md`「对后续 feature 的影响」）。

首页是 nono 唯一的入口。按 `docs/vision.md`「什么算好」第 3、4 条，它必须做到
不读长句就能用、一次打卡 10 秒内结束。所以首页最小版只做三件事：
问候语、今日进度、点一下就能打卡的九个格子。

线上的对应实现（从 bundle 逆向，已核对）：

| 项       | 线上做法                                                                |
| -------- | ----------------------------------------------------------------------- |
| 任务定义 | `tasks` 数组，18 条默认，家长端可增删改                                 |
| 打卡状态 | `dailyRecords[日期键].completedTasks[任务id] = { completed, ... }`      |
| 打卡动作 | `toggleTask(id)`，已完成则取消并**扣回**积分                            |
| 连续天数 | 从今天往前走，某天「至少一项自律任务完成」就 +1，断了就停，最多查 30 天 |
| 未知 id  | `find` 失败后静默 `return`，什么都不做                                  |

## 设计

### `data/defaultHabits.js`：18 条默认任务

线上初始 `tasks` 的 18 条**原样抄过来**，id 与 `sortOrder` 一个不改 ——
nono 线上已有的打卡记录是按这些 id 存的，改 id 等于丢历史。

| category   | 条数 | id                                                                      |
| ---------- | ---- | ----------------------------------------------------------------------- |
| `habit`    | 9    | `wake` `brush-am` `brush-pm` `dress` `toys` `room` `desk` `bag` `sleep` |
| `learning` | 5    | `literacy` `reading` `guoxue` `math` `english`                          |
| `health`   | 4    | `exercise` `vegetables` `poop` `bath`                                   |

18 条全部落库，不只落 P2 要用的 9 条：这是一份**转抄的既有资产**，不是为假想需求做的设计。
分批抄的代价是 `sortOrder` 要重排两次，而 `sortOrder` 是家长端排序的依据，重排会打乱它。

`learning` 与 `health` 的 9 条在 P2 **不渲染**，等 P5 / P6 各自的页面来用。

### 任务定义（`habits` 数组的元素）

```js
{
  id: 'wake',                 // 稳定标识，与线上一致，不可改
  name: '按时起床',
  icon: '🌅',                 // emoji，界面上代替文字
  category: 'habit',          // habit | learning | health
  frequency: 'daily',         // daily | weekly
  weeklyTarget: 3,            // 仅 frequency === 'weekly'（只有 bath 是 3）
  starReward: 1,              // 打卡产出，P2 不发放，读取点在 POINT 区（P3）
  petFoodReward: 1,
  needsParentConfirm: false,  // 家长端确认，P7 才读
  enabled: true,              // 家长可停用，停用后不出现在首页
  sortOrder: 1,               // 家长端排序依据，1 起连续
  core: true,                 // 是否计入今日全勤，P3-b 追加，见 features/point
  module: 'literacy',         // 仅 learning：指向学习子页，P5 才读
}
```

字段名按 `docs/glossary.md` 改过：线上的 `starsReward` / `foodPointsReward` 在本仓库是
`starReward` / `petFoodReward`（`star` / `petFood` 是规范名）。
线上的 `subCategory` 与 `module` 对每条 learning 任务取值完全相同，且线上只读 `module`
—— `subCategory` 是死字段，**不抄**。

`core` 是**线上没有的字段**，P3-b 加进来给今日全勤做名单：七条为 `true`
（`wake` `brush-am` `literacy` `reading` `exercise` `vegetables` `poop`），其余为 `false`。
线上把名单存成一个与 `tasks` 平行的独立数组 `rr`，家长删掉 `poop` 之后 `rr` 里还有它，
全勤于是永久不可能达成。写成任务自己的字段之后，「哪些算核心」与「这条还在不在、
还启用不启用」是同一份数据。名单为什么不含线上的 `bath` 见
`docs/features/reward/doc.md`；判定与发放在 `docs/features/point/doc.md`（`POINT-20` ~ `POINT-31`），
本区只保证字段存在。

### 当天记录（`days[dayKey]`）

```js
{
  checks: {                      // 已打卡的项，键存在即已打卡
    wake: { at: 1754880000000 }, // 打卡时刻，毫秒数
  },
}
```

**与线上的偏差：取消打卡是删键，不是写 `{ completed: false }`。**
线上留一条 `completed: false` 的墓碑，于是每个读取点都得写 `?.completed`，
漏写一次就把「取消过」当成「打过卡」。墓碑本身不携带信息（取消时刻线上也没存），
删键让「键存在 == 已打卡」成为不变式，去掉了一整类判断错误。

`days[dayKey]` 后面还会长出 `ledger`（`POINT`）、`health`（`HEALTH`）等兄弟键。
本层只写 `checks`，其它键由各自 feature 增补，`normalizeSave` 对 `days` 是整体透传，
不会因为多出键而丢数据。P3-b 又加了第五个兄弟键 `bonuses`（`{ allDone: true }`，
今日全勤的去重水位，见 `docs/features/point/doc.md`）。

### `utils/habit.js` 的八个纯函数

```js
seedHabits(save)                     -> save   // habits 为空时填默认表
listHabits(save)                     -> habit[] // 自律任务，已启用，按 sortOrder
findHabit(save, habitId)             -> habit  // 找不到抛 RangeError
isChecked(save, dayKey, habitId)     -> boolean
check(save, dayKey, habitId, now)    -> save   // 幂等
uncheck(save, dayKey, habitId)       -> save   // 幂等
dayProgress(save, dayKey)            -> { done, total }
habitStreak(save, now)               -> number
```

`findHabit` 导出是给 `POINT` 区用的：发放积分要读任务上的 `starReward` /
`petFoodReward`，让它自己再写一遍查找与抛错会出现两套「未知 id」的行为。
它**不看 `enabled`** —— 「停用」的语义只在渲染层（`listHabits`），不在发放层。

`habitStreak` 收 `now` 而不是 `todayKey`：它要往前逐日回溯，只有毫秒数才能交给 `Date`
自己处理月末与夏令时；给一个日期键的话，函数内部得自己解析字符串再做日期运算。

全部**不改传入的 `save`**，返回新对象。页面拿到返回值再写 storage ——
写 storage 失败时旧存档还在内存里，不会出现改了一半的状态。

默认任务表的填充放在 `seedHabits` 而不是 `defaultSave()`：
「默认有哪些自律任务」是 `HABIT` 的业务决定，不是存档结构的一部分。
放进 `defaultSave()` 会让 `utils/save.js` 依赖 `data/`，也会让 P1 的 `SAVE` 规格跟着变。

### 连续天数沿用线上语义

`habitStreak` 数的是「连续多少个自然日**至少完成一项**自律任务」，不是某一项的连续天数。
今天一项都没打时结果就是 0 —— 这不是惩罚（积分与勋章都不动，见 `docs/vision.md`
「什么算好」第 2 条），只是「今天还没开始」的如实显示。

往前最多查 30 天，与线上一致。上限的意义是给首页一个 O(30) 的上界，
不必为了显示一个数字扫完整个 `days`。

### 首页最小版

`pages/home/` 一屏放下：问候语、`done / total` 进度、连续天数、九个打卡格子。
格子只有 emoji + 名字 + 打过卡的对勾，点一下切换。页面自己不做任何判断：
取 `wx.getStorageSync` → 调 `utils/habit.js` → `setData` → `wx.setStorageSync`。

### storage 读写包装落在 `app.js`

按 `AGENTS.md` 第 3 节，`utils/` 不碰 `wx.*`，所以读写包装放 `app.js`：

```js
app.readSave(); // wx.getStorageSync(SAVE_KEY) 后过 normalizeSave
app.writeSave(save); // 盖上 updatedAt = Date.now() 后 wx.setStorageSync
```

storage 键名 `nono-save`，单条记录存整份存档（与线上 IndexedDB 的 `app-state` 同思路）。
放 `app.js` 而不是每个页面各写一遍，是因为「读出来必须过 `normalizeSave`」这条规矩
一旦有一个页面忘了，脏存档就会直接进页面 `data`。

## 行为规格

### 默认任务表与筛选

| Spec ID  | 输入                              | 期望输出                                         |
| -------- | --------------------------------- | ------------------------------------------------ |
| HABIT-01 | `seedHabits(defaultSave())`       | `habits` 为 18 条，`sortOrder` 1 起连续          |
| HABIT-02 | `habits` 已有 1 条时 `seedHabits` | 原样返回，不覆盖家长改过的清单                   |
| HABIT-03 | `listHabits`                      | 9 条 `category === 'habit'`，按 `sortOrder` 升序 |
| HABIT-04 | 某条 `enabled: false`             | 不出现在 `listHabits` 结果里                     |

### 打卡与取消

| Spec ID  | 输入                                       | 期望输出                                    |
| -------- | ------------------------------------------ | ------------------------------------------- |
| HABIT-05 | `check(save, '2026-08-12', 'wake', now)`   | `days['2026-08-12'].checks.wake.at === now` |
| HABIT-06 | 对同一项连续 `check` 两次                  | 幂等，`at` 保持第一次的值                   |
| HABIT-07 | `uncheck` 已打卡的项                       | 键被删除，`isChecked` 为 `false`            |
| HABIT-08 | `uncheck` 没打过卡的项                     | 原样返回，不抛错                            |
| HABIT-09 | `check` / `uncheck` 一个不存在的 `habitId` | 抛 `RangeError`                             |
| HABIT-10 | `check` 后检查传入的 `save`                | 未被改动（返回的是新对象）                  |

`HABIT-09` 与线上不同：线上 `find` 失败后静默返回。首页传的 id 全部来自 `listHabits`，
所以传错 id 只可能是编程错误 —— 静默会让打卡按钮变成「点了没反应」，且没有任何线索。

### 进度与连续天数

| Spec ID  | 输入                         | 期望输出                         |
| -------- | ---------------------------- | -------------------------------- |
| HABIT-11 | 9 项中打了 2 项              | `{ done: 2, total: 9 }`          |
| HABIT-12 | `days` 里没有该 `dayKey`     | `{ done: 0, total: 9 }`          |
| HABIT-13 | 今天与前两天各有至少一项打卡 | `habitStreak` 为 `3`             |
| HABIT-14 | 今天一项未打，昨天打过       | `habitStreak` 为 `0`             |
| HABIT-15 | 今天打过，昨天空，前天打过   | `habitStreak` 为 `1`（断点即止） |
| HABIT-16 | 连续 40 天都打过             | `habitStreak` 为 `30`（上限）    |
| HABIT-17 | `check` 的 `now` 非有限数    | 抛 `TypeError`                   |

`dayProgress` 的 `total` 是**当前启用的自律任务数**，不是固定的 9 ——
家长停用一项后，进度分母跟着变，否则永远到不了满格。

## 范围外

- **不发放任何积分。** 打卡只改 `checks`，不动 `currency`、不写 `ledger`。
  `starReward` / `petFoodReward` 两个字段先转抄进来，等 `POINT`（P3）来读。
  这意味着 P2 的首页点起来是「有反馈但不涨数字」的，是过渡态。
  P3 已落地：读取点是 `miniprogram/utils/point.js` 的 `checkAndAward` /
  `uncheckAndRefund`，本区的 `check` / `uncheck` 仍然只写 `checks`
  （见 `docs/features/point/doc.md`）。
- ~~**不做今日全勤（`allDone`）与周奖励。**~~ P3-b 已做：判定与发放在
  `docs/features/point/doc.md`（`POINT-20` ~ `POINT-31`），名单是任务自己的 `core` 字段
  且收敛成**七条**（去掉了线上的 `bath`，理由见 `docs/features/reward/doc.md`）。
  本区只保证 `core` 字段存在，不写判定。
- **不做家长端增删改任务。** `enabled` / `sortOrder` / `needsParentConfirm` 三个字段
  P2 只读不写，写入路径在 `PARENT`（P7）。
- **不做 `frequency: 'weekly'` 的周目标计数。** `bath` 的 `weeklyTarget: 3` 先存着不用，
  P2 把它和日常项一样按天记 —— 周计数要先有「周」的键，那是 `POINT` 的周奖励一起做。
  P6 已落地，但落的只是**显示**：`utils/dayKey.js` 的 `weekKeys` 给出本周七个键，
  健康页的洗澡卡显示「本周 N/3」，`bath` 仍然每天打卡都发放
  （见 `docs/features/health/doc.md`）。周奖励本身仍在 `POINT`（P3-b）。
- **不做 `learning` / `health` 两类的页面。** 定义落库，渲染留给 P5 / P6。
  两者均已落地：`docs/features/learning/doc.md`（阅读 + 英语）与
  `docs/features/health/doc.md`（四项健康）。`listHabits` 仍只返回 `category === 'habit'`，
  两个域各有自己的列出路径。
- **不做取消打卡的二次确认。** 5 岁孩子误触的代价是一次重新点击，加确认框违反
  「一次互动短」。
