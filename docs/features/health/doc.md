# 健康记录（饮食 · 便便 · 洗澡 · 运动）

- 区名：`HEALTH`（当天健康记录与其中四项的打卡发放）
- 模块：`miniprogram/utils/health.js`、`miniprogram/pages/health/`
- 状态：已完成（见 `summary.md`）。P6 一轮做完，健康域没有第二段
- 关联愿景：`docs/vision.md` P6

## 背景

`docs/vision.md` 的五件事里，健康是最后一件没有页面的日常项。它的四条任务在 P2 就已落库
（`data/defaultHabits.js` 的 `exercise` / `vegetables` / `poop` / `bath`，
`category: 'health'`），`docs/features/habit/doc.md`「范围外」写明「定义落库，渲染留给 P5 / P6」，
所以本轮**不动 `data/defaultHabits.js`**，只补上读写它们的那一层。

顺带的收益比 P5 首段更大：`exercise` / `vegetables` / `poop` / `bath` 是线上今日全勤那
8 条核心 id 里的**四条**（见 `docs/features/point/summary.md`）。本轮做完，8 条里只剩
`literacy` 没有打卡入口，P3-b 的勋章产出就只差识字一个页面。

健康域**没有新的内容资产**：不需要数据包、不需要复习调度、不需要新的经验常量
（健康打卡与自律打卡同价，都是 5 点经验）。它要新增的只有一个时间原语 ——
「本周」的日期键，见下文。

线上的对应实现（从 bundle 逆向，已核对）：

| 项       | 线上做法                                                                            |
| -------- | ----------------------------------------------------------------------------------- |
| 入口     | `/health`「健康生活」，从首页 `navigateTo`，四张卡片                                |
| 提交     | `updateHealth(patch)`：合并进 `dailyRecords[日].health`                             |
| 发放     | `patch` 里出现 `Ao` 表中的键且转为真时，按 `pointRules.health` 发放                 |
| 撤回     | 同一个键转为假且该任务已完成时，退回货币，流水记 `取消：${name}`                    |
| `Ao` 表  | `{ vegetables, poop, bath, exercise }` —— **只有这四个键发放**                      |
| 经验     | 走的是与自律打卡同一个 `ko`，`{ exp: 5 }`，开心度 +1                                |
| 饮食卡   | `lessSugar` 开关；开着时露出 `sugarCount`（0–20）；`vegetables` / `fruit` / `water` |
| 便便卡   | 三个 emoji 😊 😐 😣，点一个 → `{ poop: true, poopIcon: 该 emoji }`                  |
| 洗澡卡   | 标题写「洗澡 🛁 本周 N/3」；`bath` 开关；开着时露出 `bathHair`                      |
| 运动卡   | `exercise` 开关；开着时露出分钟数输入，改它同时写 `exercise: true`                  |
| 本周计数 | `mr()` 给出周一到周日 7 个日期键，`bath` 在这 7 天里完成的天数                      |

`pointRules.health` 是 `{ stars: 1, foodPoints: 1 }`，与 `data/defaultHabits.js` 里那四条的
`starReward` / `petFoodReward` 逐条相同 —— 与 `POINT` 区当初的偏差（只读任务自身的产出值，
不查 `pointRules`）在数值上等价，本区不必再做映射。

## 设计

### 十一个字段，四个发放

当天记录的 `health` 子对象有十一个字段，其中**只有四个**连着自律任务：

| 字段              | 类型     | 对应任务     | 发放 |
| ----------------- | -------- | ------------ | ---- |
| `vegetables`      | 布尔     | `vegetables` | 是   |
| `poop`            | 布尔     | `poop`       | 是   |
| `bath`            | 布尔     | `bath`       | 是   |
| `exercise`        | 布尔     | `exercise`   | 是   |
| `lessSugar`       | 布尔     | —            | 否   |
| `fruit`           | 布尔     | —            | 否   |
| `water`           | 布尔     | —            | 否   |
| `bathHair`        | 布尔     | —            | 否   |
| `sugarCount`      | 非负整数 | —            | 否   |
| `exerciseMinutes` | 非负整数 | —            | 否   |
| `poopIcon`        | 三选一   | —            | 否   |

`fruit` 与 `water` 是**开关但不发放**，与线上一致。这看起来像漏了发放，其实不是：
要给它们发放就得往 `data/defaultHabits.js` 里加两条任务，而那张表的 id 集合是
今日全勤的分母、也是 P7 家长端的编辑面 —— 加两条会让「今日全勤」的含义在没人拍板的情况下变掉。
它们是「记一笔给家长看」的字段，不是打卡项（`HEALTH-05` 钉住这条）。

### 两个写入口：`toggleHealth` 与 `setHealth`

四张卡片上的控件只有两类：**开关**（点一下反转）与**取值**（数字 / 选 emoji）。所以两个函数：

```js
healthState(save, key, now)              -> { log, bathWeek, poopIcons, sugarMax }
toggleHealth(save, key, field, now)      -> save   // 只收布尔字段
setHealth(save, key, field, value, now)  -> save   // 只收取值字段
```

`toggleHealth` **不收 `value`**：反转由它自己算。让页面传 `!当前值` 等于把
「开关是什么语义」搬进页面，而且发放与退回的配对就少了一个统一的把关处 ——
四个布尔字段里有四个要发放，配对错一次就是「星星涨了但取消不退」。

传错类别的字段一律抛 `RangeError`（`HEALTH-07` / `HEALTH-16`）：页面上的控件是
`healthState` 渲染出来的，布尔字段不会出现在数字输入框里，传错只可能是代码写错。

### 发放先行，记录后写

```js
const awarded = habitId ? (on ? checkAwardAndGrow(...) : uncheckAndRefund(...)) : save;
const day = awarded.days?.[key] ?? {};                 // 从发放后的存档里取
return { ...awarded, days: { ...awarded.days, [key]: { ...day, health: { ... } } } };
```

顺序与 `completeLearning` **相反**（那里是先写记录再打卡），而且这个顺序不脆弱：
`day` 是从 `awarded` 里取的，所以发放往 `days[key]` 上追加的 `checks` 与 `ledger`
一定在 `day` 里，不存在被旧对象覆盖的可能。`completeLearning` 靠 `LEARN-10` 守着一个
必须正确的顺序，本区靠「读的是上一步的输出」让顺序不再要紧。`HEALTH-20` 仍然断言
三个兄弟键同时在位 —— 它是回归防线，不是这里唯一的保障。

`checkAwardAndGrow` 不传第五参数：健康打卡的经验就是默认的 5，与自律打卡同价
（线上走的是同一个 `ko`）。本区因此**没有新的经验常量**，`HEALTH-03` 钉住这个 5。

### 蕴含：填了值就等于做了这件事

线上两处「改值顺带打开开关」：

- 点便便 emoji → `{ poop: true, poopIcon }`
- 改运动分钟数 → `{ exerciseMinutes, exercise: true }`

本仓库沿用，并把它做成表里的一个 `turnsOn` 字段而不是两处 `if`。理由是**记录不能自相矛盾**：
「`poopIcon` 是 😊 但 `poop` 是 `false`」和「运动了 30 分钟但 `exercise` 是 `false`」
都是读起来讲不通的记录。选了心情就是记了一次便便，所以 `setHealth('poopIcon', ...)`
会连带打卡与发放（`HEALTH-11`）。

`exerciseMinutes` 的 `turnsOn` 在界面上走不到（分钟数输入框只在 `exercise` 已经打开时才露出），
它是那条不变式的兜底，不是一条界面路径。`HEALTH-13` 钉的是函数契约。

蕴含只打开、**不关闭**：`exercise` 关掉时不清 `exerciseMinutes`，`lessSugar` 关掉时不清
`sugarCount`（线上如此）。清掉等于「手滑关一下就丢数据」，而留着的代价只是一个不显示的字段。

### `bath` 的周目标：只显示，不设门禁

`bath` 是十八条任务里唯一的 `frequency: 'weekly'`，`weeklyTarget: 3`。
`docs/features/habit/doc.md`「范围外」把它推给了「`POINT` 的周奖励一起做」，
但洗澡卡的标题上要写「本周 N/3」，所以本轮必须回答它。

答案是**只做显示**：`bath` 每打开一次就发放一次，与日常项完全一样（线上也在 `Ao` 里，
按天发放）；`weeklyTarget` 只喂给标题上那个分母。做成门禁（一周只发 3 次）会引出
「第 4 次洗澡要不要给星星」这种要拍板的问题，而它与「温和，不惩罚」的方向相反。

`weeklyTarget` 由此有了第一个读取点。任务被家长删掉时 `bathWeek` 为 `null`，
标题上不显示计数（`HEALTH-18`）—— 与 `listLearning` 对缺任务的宽容同一条
（`AGENTS.md` 第 5 节第 6 条：渲染宽容、提交严格）。

本周完成的天数按 **`checks` 数**，不按 `health.bath` 数。线上两个都数
（`t[e]?.health?.bath || t[e]?.completedTasks.bath?.completed`）是历史遗留；
本仓库从第一天起 `checks` 就是「做没做」的唯一真相（`HABIT` 区的不变式），
数两处等于给自己留一个「两边不一致时听谁的」的问题。

### 「本周」这个原语放进 `DAY` 区

周计数需要「本周是哪 7 天」，而这不是健康域独有的：P3-b 的周奖励要同一份键
（线上 `Mr` 与 `Rr` 用的是同一个 `mr()`）。所以它进 `DAY` 区，
`docs/features/storage/doc.md` 追加 `DAY-06` ~ `DAY-09` 与 `weekKeys` 的说明，
本文件不重复声明那四条规格。

```js
weekKeys(now) -> ['周一', ..., '周日']  // 7 个 dayKey，周一为起点
```

**周一为起点，周日归到它前面那个周一**（线上 `t === 0 ? -6 : 1 - t`）。
这是中文语境里「本周」的通常含义，也让「周日晚上洗了澡」算进刚过去的那一周而不是下一周。

### `utils/health.js` 的三个函数

```js
healthState(save, key, now)             -> { log, bathWeek, poopIcons, sugarMax }
toggleHealth(save, key, field, now)     -> save   // 布尔字段，发放 / 退回都在这里
setHealth(save, key, field, value, now) -> save   // 取值字段，可能连带打卡
```

依赖方向 `health.js → pet.js → point.js → habit.js → dayKey.js`，无环。
与 `learning.js` **互不引用** —— 两个域除了都用 `checkAwardAndGrow` 之外没有共同概念。

`healthState` 是页面唯一的读取入口，返回四样东西：

- `log`：十一个字段的**规范化**当前值（缺的补默认、越界收敛），页面直接绑
- `bathWeek`：`{ done, target }` 或 `null`
- `poopIcons`：`[{ icon, current }]` —— 与 `petState().types` 同一个形状，
  页面不自己写那三个 emoji，也不自己判断哪个被选中
- `sugarMax`：`20`。导出边界数字的理由与 `ENG_OPTIONS` 同一条：
  页面上按得出 21 而存档里落 20，就是「控件与收敛对不上」。
  收敛的权威仍在 `setHealth`（`HEALTH-10`）

三个函数都取 `key` 与 `now`（`healthState` 两个都要）：`key` 是当天记录的键，
`now` 是往前走一周要用的时刻 —— 日期键是字符串，不能往回走。

`setHealth` 写入与当前相同的值且蕴含的开关已经打开时**原样返回**（`HEALTH-15`）：
数字输入框每敲一下就触发一次，没有这条同一性，页面每个按键都会写一次 storage。

**收敛先算、再比同值。** 所以「糖数从 0 改成 -1」不会落盘 —— 收敛后的 `0` 与当前值相同，
走的是同一性那条路。`HEALTH-10` 断言的是**收敛后的读数**（`healthState().log`），
不是「一定写了一次记录」：这两者在越界输入上会分开，而页面关心的只有读数。

### 一个页面，一张四卡表

| 卡片    | 内容                                                            |
| ------- | --------------------------------------------------------------- |
| 饮食 🥗 | 少吃糖（开着时露出「今天吃了 N 颗糖」）、吃青菜、吃水果、多喝水 |
| 便便 💩 | 三个 emoji，点一个即完成                                        |
| 洗澡 🛁 | 今天洗澡了（开着时露出「洗了头发」）；标题带「本周 N/3」        |
| 运动 🏃 | 今天运动了（开着时露出分钟数输入）                              |

`app.json` 的 tabBar 加**第四个** tab（`🥗 健康`），插在学习与小伙伴之间：
首页 / 学习 / 健康 / 小伙伴。线上健康是从首页跳进去的普通页面，本仓库把它提成 tab ——
学习已经是 tab 了，两件同为「每天要进去一次」的事放在两个层级上，5 岁的孩子要记两套路径。
小伙伴仍留在最后（它是前面几件事的情绪出口，不是入口）。仍**不用图片图标**。

健康页是 tab 页，所以取数用 `onShow` 而不是 `onLoad`（与学习入口页同一条，
两个表单页用 `onLoad` 的理由见 `docs/features/learning/doc.md`）。

页面里不写阈值、不写那三个 emoji、不写周目标的 3，也不算「该不该露出下一行」之外的判断。

### 样式不抽公共层：健康页不是第三个表单页

`english.wxss` 的头注释留了一条约定：「等第三个表单页出现，如果还是这套，那时再提」。
健康页**不触发它**：四张卡片上没有提交按钮（点开关即落盘，没有「填完再交」这一步），
也没有 `field--col` 那套标签 + 输入框的竖排版，只有两个内联的数字输入。
共用的其实只有 `card` 一个类名，而一个类名不值得提到全局。

所以 `app.wxss` 仍然只放变量与 reset，`english.wxss` 那条注释**原样留着** ——
它等的是数学 / 识字页，那两个才是真的表单。这个判断记在 `health.wxss` 的头注释里，
免得下一轮再推一遍。

## 行为规格

### 健康记录与四项打卡（`HEALTH`）

| Spec ID   | 输入                                                     | 期望输出                                                                                   |
| --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| HEALTH-01 | 今天还没记过时 `healthState(save, key, now)`             | `log` 十一个字段全是默认值（布尔 `false`、计数 `0`、`poopIcon` 空串）                      |
| HEALTH-02 | `toggleHealth(save, key, 'vegetables', now)`             | 记录为 `true`，`checks.vegetables` 在位，`star` / `petFood` 各 +1，流水一条 `完成：吃青菜` |
| HEALTH-03 | 同上                                                     | `petExp` +5（与自律打卡同价，不是学习的 8），`mood` +1                                     |
| HEALTH-04 | 打开后再 `toggleHealth(save, key, 'vegetables', now)`    | 记录为 `false`，`checks` 里的键被删，货币退回，流水第二条 `取消：吃青菜`                   |
| HEALTH-05 | `toggleHealth(save, key, 'fruit', now)`                  | 记录为 `true`，但 `checks` / 货币 / 流水都不动                                             |
| HEALTH-06 | `toggleHealth` 传未登记的 `field`                        | 抛 `RangeError`                                                                            |
| HEALTH-07 | `toggleHealth` 传 `sugarCount`（取值字段）               | 抛 `RangeError`                                                                            |
| HEALTH-08 | `toggleHealth` 的 `now` 非有限数                         | 抛 `TypeError`                                                                             |
| HEALTH-09 | `setHealth(save, key, 'sugarCount', '3', now)`           | 落 `3`（字符串收成数字），不打卡、不发放                                                   |
| HEALTH-10 | `sugarCount` 为 `-1` / `99` / `2.6`                      | 收敛成 `0` / `20` / `3`                                                                    |
| HEALTH-11 | `setHealth(save, key, 'poopIcon', '😣', now)`            | `poopIcon` 为 `'😣'` 且 `poop` 为 `true`，同时发放一次（选心情即记了一次便便）             |
| HEALTH-12 | `poopIcon` 不在三个 emoji 里                             | 抛 `RangeError`                                                                            |
| HEALTH-13 | `setHealth(save, key, 'exerciseMinutes', 30, now)`       | 落 `30` 且 `exercise` 为 `true`，发放一次                                                  |
| HEALTH-14 | 已发放后再 `setHealth(save, key, 'exerciseMinutes', 45)` | 分钟数改成 `45`，流水仍只有一条（不重复发放）                                              |
| HEALTH-15 | `setHealth` 写入与当前相同的值、且蕴含的开关已打开       | 原样返回（对象同一性），页面不落盘                                                         |
| HEALTH-16 | `setHealth` 传 `vegetables`（布尔字段）                  | 抛 `RangeError`                                                                            |
| HEALTH-17 | 本周有两天打过 `bath` 时 `healthState`                   | `bathWeek` 为 `{ done: 2, target: 3 }`                                                     |
| HEALTH-18 | `habits` 里没有 `bath` 时                                | `healthState` 不抛错且 `bathWeek` 为 `null`；`toggleHealth('bath')` 抛 `RangeError`        |
| HEALTH-19 | `toggleHealth` / `setHealth` 之后检查入参 `save`         | 未被改动（返回的是新对象）                                                                 |
| HEALTH-20 | 完成一次健康打卡后看 `days[key]`                         | `checks` / `ledger` / `health` 三个兄弟键同时存在，互不覆盖                                |

`HEALTH-03` 的 5 与 `LEARN-08` 的 8 是一对：同一个 `checkAwardAndGrow`，
健康不传第五参数、学习传 8。两条都在，是为了挡住下一个人把它们统一成一个数。

`HEALTH-05` 与 `HEALTH-02` 也是一对刻意的不一致：同样是一个开关，青菜发星星、水果不发。
理由在上文（发放要以 `data/defaultHabits.js` 有没有那条任务为准，
而那张表的 id 集合是今日全勤的分母）。

`HEALTH-11` 与 `HEALTH-13` 共用「填了值就等于做了」这条规则，但只有前者在界面上走得到。

`weekKeys` 的四条规格在 `docs/features/storage/doc.md`（`DAY-06` ~ `DAY-09`），本表不重复。

## 范围外

- **不做周目标门禁。** `bath` 每次打开都发放，`weeklyTarget: 3` 只喂给标题上的分母。
  见上文的取舍。
- **不给 `fruit` / `water` 发放。** 线上也不发。要发就得往 `data/defaultHabits.js` 加两条任务，
  那会改掉今日全勤的分母与 P7 家长端的编辑面。
- **不做喝水杯数。** 线上 `water` 就是一个布尔，没有计数字段，不臆造
  （`AGENTS.md` 第 5 节第 7 条）。
- **不做今日全勤与周奖励。** 本轮把 8 条核心 id 里的四条补上了打卡入口，
  判定与发放本身仍在 `POINT` 区（P3-b）。`weekKeys` 是给它准备的，但周奖励的
  `lastWeeklyBonusWeek` 存档字段、60% / 5 天的规则都不在本轮。
- **不改 `data/defaultHabits.js`。** 四条健康任务的 id、名字、图标、产出值原样使用。
- **不做健康数据的趋势与累计。**「这周吃了几次青菜」「平均运动多少分钟」是家长端每日报告
  （P7）的事，本轮只写当天记录。
- **不做首页显示健康进度。** 首页仍是「问候语 + 进度 + 货币带 + 九个自律格子」，
  `dayProgress` 的分母仍只数 `category === 'habit'`。
- **不做家长确认。** 四条健康任务的 `needsParentConfirm` 都是 `false`，字段仍只读不写（P7）。
- **不做糖分与健康的因果提示。** 不出现「糖吃多了会长虫牙」这类负面反馈
  （`docs/vision.md`「温和，不惩罚」）。少吃糖是一个可以打开的开关，不是一条警告。
