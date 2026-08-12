# 数据模型与存储层

- 区名：`SAVE`（存档结构与读写）、`DAY`（自然日）、`IMPORT`（线上 JSON 导入）
- 模块：`miniprogram/utils/dayKey.js`、`miniprogram/utils/save.js`、`miniprogram/utils/importOnline.js`
- 状态：已完成（见 `summary.md`）。P4 追加了 `pet.lastFedAt`（`SAVE-12` / `IMPORT-10`），
  P6 追加了 `weekKeys`（`DAY-06` ~ `DAY-09`）
- 关联愿景：`docs/vision.md` P1

## 背景

所有页面读写同一份存档。结构定错了，后面每个页面都要改 —— 所以 P1 先做这一层，
且必须先能容纳线上 JSON 的全部字段（见 `docs/vision.md`「数据迁移」）。

线上工作台的持久化事实（从 bundle 逆向得到，逐条核对过）：

| 项             | 值                                                               |
| -------------- | ---------------------------------------------------------------- |
| 存储           | IndexedDB，库名 `nono-workbench`，objectStore `state`，版本 1    |
| 记录键         | `app-state`（单条记录存整个 state）                              |
| 导出 JSON      | 19 个顶层键的显式白名单，运行时字段（toast、动画）不落盘         |
| 日期键         | `YYYY-MM-DD`，**本机时区**（`getFullYear` + `padStart`，非 UTC） |
| 打卡/健康/学习 | 全部挂在 `dailyRecords[日期键]` 下，不分表                       |

线上导出 JSON 的 19 个顶层键：
`version` `profile` `currency` `pet` `tasks` `dailyRecords` `pointRules` `rewardRules`
`exchangeRecords` `parentSettings` `unlockedMedals` `medalProgress` `learningProgress`
`soundEnabled` `stickerCollection` `lastFreeStickerDate` `lastWeeklyBonusWeek`
`createdAt` `updatedAt`

## 设计

### 三个纯函数模块

```js
// dayKey.js —— 自然日
dayKey(now) -> 'YYYY-MM-DD'
isSameDay(a, b) -> boolean
weekKeys(now) -> ['YYYY-MM-DD' × 7]   // 本周的七个日期键，周一为起点

// save.js —— 存档默认值与补齐
defaultSave() -> save
normalizeSave(raw) -> save

// importOnline.js —— 线上 JSON 一次性导入
importOnlineSave(onlineJson) -> save
```

页面层负责 `wx.getStorageSync` / `setStorageSync` 与 `Date.now()`，
三个模块都不碰 `wx.*`、不读当前时间（见 `AGENTS.md` 第 3 节）。

### 命名：本仓库用 glossary 的词，不用线上字段名

线上的字段名与 `docs/glossary.md` 的规范命名不一致。本仓库存档一律用 glossary 的词，
导入时做一次映射。代价是映射表要维护，收益是后续所有业务代码只需记一套名字。

| 线上字段                   | 本仓库字段         | 说明                              |
| -------------------------- | ------------------ | --------------------------------- |
| `currency.stars`           | `currency.star`    | 单复数统一为单数                  |
| `currency.gems`            | `currency.gem`     |                                   |
| `currency.foodPoints`      | `currency.petFood` | 「份数」是界面说法，存的是点数    |
| `currency.medals`          | `currency.medal`   |                                   |
| `pet.satiety`              | `pet.fullness`     | 取值 0–5 原样保留，不换刻度       |
| —（线上没有）              | `pet.lastFedAt`    | 饱腹度衰减的基准，导入时落 `0`    |
| `pet.happiness`            | `pet.mood`         | 取值 0–5 原样保留                 |
| `pet.level`                | `pet.petLevel`     | 避免与数学 `stage` 的层级概念混淆 |
| `pet.exp`                  | `pet.petExp`       |                                   |
| `profile.name`             | `childName`        | 提到顶层，存档只服务一个孩子      |
| `profile.avatarEmoji`      | `childAvatar`      |                                   |
| `parentSettings.pin`       | `parent.pin`       |                                   |
| `parentSettings.dailyGoal` | `parent.dailyGoal` |                                   |
| `parentSettings.note`      | `parent.note`      |                                   |
| `dailyRecords`             | `days`             | 键仍是 `dayKey`，格式不变         |
| `tasks`                    | `habits`           | glossary 里 `habit` 指自律任务    |
| `exchangeRecords`          | `redemptions`      |                                   |
| `unlockedMedals`           | `achievements`     | 存的是成就 id，不是货币           |
| `createdAt` / `updatedAt`  | 同名               | ISO 字符串转成毫秒数              |

`pet.unlockedDecor` 在线上是死字段（只有默认值和导入合并，无任何写入路径），**不迁移**。
`learningProgress.english.streak`、`reading.totalMinutes`、`reading.books` 同为只读不写的
死字段，导入时保留数值但本仓库不依赖它们。

### 存档结构

```js
{
  version: 1,
  childName: 'nono',
  childAvatar: '👧',
  currency: { star: 0, gem: 0, petFood: 0, medal: 0 },
  pet: {
    type: 'unicorn', name: '彩虹', petLevel: 1, petExp: 0,
    fullness: 3, mood: 4,
    lastFedAt: 0,       // 饱腹度衰减的基准时刻，0 = 还没有基准
  },
  habits: [],            // 自律任务定义，家长端可增删
  days: {},              // dayKey -> 当天记录
  redemptions: [],        // 兑换记录，最新在前
  achievements: [],       // 已解锁成就 id
  parent: { pin: '1234', dailyGoal: 6, note: '' },
  soundEnabled: true,
  createdAt: 0,           // 毫秒时间戳，由页面层传入
  updatedAt: 0,
}
```

`fullness` 默认 3、`mood` 默认 4 沿用线上初值，不是随手取的数。

`pet.lastFedAt` 是**线上没有的字段**，P4 加进来给饱腹度衰减做基准。
默认 `0` 表示「还没有基准」，`FULLNESS-01` 规定这种情况不衰减、只把基准立成当前时刻 ——
否则 `now - 0` 是个巨大的差值，首次进入或导入线上存档就会看到饿瘪的宠物。
衰减规则本身在 `docs/features/pet/doc.md`，本层只保证字段存在且被收敛成非负整数。

时间戳用毫秒数而非线上的 ISO 字符串：存档要能 `JSON.stringify` 后原样读回，
数值比字符串少一层解析，也与 glossary 的 `now` 约定一致。

### 「本周」是哪七天：`weekKeys`

P6 的洗澡卡要显示「本周 N/3」，P3-b 的周奖励要判断「这周是不是发过了」。
两处需要的是同一份东西 —— 本周的七个日期键 —— 所以它落在 `DAY` 区，
而不是各自算一遍（线上 `Rr` 与 `Mr` 也共用同一个 `mr()`）。

```js
weekKeys(1754880000000) -> ['2026-08-10', ..., '2026-08-16']  // 周一 … 周日
```

**周一为起点，周日归到它前面那个周一。** 这是中文语境里「本周」的通常含义，
也让「周日晚上洗了澡」算进刚过去的那一周而不是下一周
（线上 `t === 0 ? -6 : 1 - t`，同一条）。

跨月、跨年由 `Date` 自己进位，本函数不做日期算术 —— 从周一那天起用 `setDate(+i)`
逐天推出七个时刻，再逐个交给 `dayKey`。所以 `weekKeys` 的时区口径与 `dayKey` 天然一致，
不存在第二套「一天从几点开始」的规则。

七个键**总是七个**，不因为跨月或存档里没有记录而变短：调用方是拿它去
`days[key]` 上查的，缺的那天自然查不到。返回「本周有记录的那几天」会让
「本周 N/3」的分母跟着存档变。

`weekKeys` 只返回键，**不返回星期几的文案**。「周一」这类标签是渲染的事，
本层给的是查存档用的键（线上把 `hr = ['周一', …]` 放在组件里，同一条分工）。

本文件只覆盖**存档的形状、默认值补齐、日期键、线上导入映射**。
具体业务规则（打卡怎么发星光、宠物怎么升级、复习怎么排）各自在后续 feature 的 `doc.md` 里，
本文件不写它们的公式。

## 行为规格

### 自然日（`DAY`）

| Spec ID | 输入                                        | 期望输出                                           |
| ------- | ------------------------------------------- | -------------------------------------------------- |
| DAY-01  | `dayKey(2026-08-11 13:45 本机时区的毫秒数)` | `'2026-08-11'`                                     |
| DAY-02  | 月、日为个位数时                            | 补零，如 `'2026-01-05'`                            |
| DAY-03  | 同一自然日内的两个时刻（0:00 与 23:59）     | `isSameDay` 为 `true`                              |
| DAY-04  | 相邻两日的 23:59 与次日 0:00                | `isSameDay` 为 `false`                             |
| DAY-05  | `now` 非有限数（`NaN` / 字符串 / `null`）   | 抛 `TypeError`                                     |
| DAY-06  | `weekKeys(2026-08-12 的某个时刻)`（周三）   | 七个键 `'2026-08-10'` ~ `'2026-08-16'`，周一在首位 |
| DAY-07  | `weekKeys(2026-08-16 的某个时刻)`（周日）   | 同一组七个键，当天落在**末位**而不是首位           |
| DAY-08  | `weekKeys(2026-12-31 的某个时刻)`（周四）   | `'2026-12-28'` ~ `'2027-01-03'`，跨年正确          |
| DAY-09  | `weekKeys` 的 `now` 非有限数                | 抛 `TypeError`（与 `dayKey` 同一条）               |

跨日以**本机时区 0 点**为界，不用 UTC。线上就是这么做的，改成 UTC 会让晚上 8 点后的
打卡算到第二天。

`DAY-07` 是这四条里唯一容易写错的：`getDay()` 的周日是 `0`，直接用 `1 - 0` 会把周日
推到**下一周**的周一，于是「周日晚上洗了澡」算进了还没开始的那一周。所以周日单独走 `-6`。

### 存档默认值与补齐（`SAVE`）

| Spec ID | 输入                                        | 期望输出                            |
| ------- | ------------------------------------------- | ----------------------------------- |
| SAVE-01 | `normalizeSave(undefined)`（首次进入）      | 等于 `defaultSave()`                |
| SAVE-02 | 只含 `currency.star` 的对象                 | 其余字段取默认值，`star` 保留传入值 |
| SAVE-03 | `currency` 中缺 `petFood`                   | `petFood` 补 `0`，不是 `undefined`  |
| SAVE-04 | 非对象输入（数字 / 字符串 / 数组 / `null`） | 等于 `defaultSave()`，不抛错        |
| SAVE-05 | `pet.fullness` 为 `9`（越界）               | 收敛到 `5`                          |
| SAVE-06 | `pet.fullness` 为 `-1`                      | 收敛到 `0`                          |
| SAVE-07 | `pet.fullness` 为 `2.7`（非整数）           | 收敛到 `3`（四舍五入）              |
| SAVE-08 | `pet.petLevel` 为 `0`                       | 收敛到 `1`（等级从 1 开始）         |
| SAVE-09 | `currency.star` 为 `-5`                     | 收敛到 `0`（货币非负）              |
| SAVE-10 | 含未知顶层字段 `foo`                        | 丢弃 `foo`，不写进结果              |
| SAVE-11 | `days` 中含一条合法日期键                   | 原样保留该键与其内容                |
| SAVE-12 | `pet.lastFedAt` 缺失 / 为负 / 非数值        | 补 `0`，不是 `undefined`            |

存档来自 storage，可能被手改或被旧版本写坏，所以 `normalizeSave` **不抛错**：
一律收敛到合法值。这与 `utils/` 里其它纯函数对非法入参抛 `RangeError` 的约定不同 ——
存档读取失败就白屏，违反「什么算好」第 2 条（不清零、不惩罚）。
唯一抛错的是 `dayKey`：那是编程错误，不是用户数据问题。

### 线上 JSON 导入（`IMPORT`）

| Spec ID   | 输入                                       | 期望输出                                     |
| --------- | ------------------------------------------ | -------------------------------------------- |
| IMPORT-01 | 含 `currency.stars/gems/foodPoints/medals` | 映射到 `star/gem/petFood/medal`，数值不变    |
| IMPORT-02 | 含 `pet.satiety/happiness/level/exp`       | 映射到 `fullness/mood/petLevel/petExp`       |
| IMPORT-03 | 含 `profile.name`                          | 映射到顶层 `childName`                       |
| IMPORT-04 | 含 `dailyRecords` 的两个日期键             | 原样成为 `days` 的两个键                     |
| IMPORT-05 | 含 `unlockedMedals: ['early-bird']`        | 成为 `achievements: ['early-bird']`          |
| IMPORT-06 | 含 `pet.unlockedDecor`                     | 丢弃该字段                                   |
| IMPORT-07 | 空对象 `{}`                                | 等于 `defaultSave()`，不抛错                 |
| IMPORT-08 | 非对象输入                                 | 抛 `TypeError`（导入是用户主动动作，要报错） |
| IMPORT-09 | `createdAt` 为 ISO 字符串                  | 转成毫秒数；无法解析时取默认值 `0`           |
| IMPORT-10 | 任意线上 JSON                              | `pet.lastFedAt` 为 `0`（线上无此字段）       |

导入与读存档的错误策略相反：**导入非法数据要报错**。用户是主动粘贴 JSON 的，
静默用默认值会让他以为导入成功了，实际清零 —— 那正是迁移要避免的事故。

`IMPORT-10` 是本仓库多出来的字段落在导入路径上的样子：`pet.lastFedAt` 线上不存在，
所以映射表里没有它的来源行，落 `0` 由 `normalizeSave` 完成。`0` 的含义是
「还没有衰减基准」，导入后第一次打开宠物页会把基准立成当时 ——
导入不会让 nono 的小伙伴一进来就是饿的（见 `docs/features/pet/doc.md` 的 `FULLNESS-01`）。

线上多出来的 9 个顶层键（`pointRules` `rewardRules` `medalProgress` `learningProgress`
`stickerCollection` `lastFreeStickerDate` `lastWeeklyBonusWeek` 及其内部字段）本层**不接**：
它们属于后续 feature（`POINT` / `REWARD` / `ACHV` / `STICKER` / 学习域），
等那些 feature 定义了自己的结构再扩存档与映射表。这条是刻意的取舍，不是遗漏 ——
先把线上 JSON 原文留在用户手上，导入可以重跑。

## 范围外

- 不做双向同步。导入是一次性动作，导入后线上数据不再是来源。
- 不做存档版本迁移。`version` 字段先占位，`version !== 1` 的处理留到真的出现第 2 版时再写
  （线上的 `version` 也从未有过迁移分支）。
- 不做加密。家长 PIN 在线上是明文存在同一份可导出 JSON 里的，本仓库沿用 ——
  家庭自用场景下，加密带来的复杂度换不到实际安全收益。这一点在 `PARENT` 区的
  `doc.md` 里要再说明一次。
- 不写具体业务规则的公式（打卡产出、升级、复习调度）。
- 不做 `habits` / `days` 内部结构的完整规格 —— 那些字段由各自的 feature 定义，
  本层只保证「原样存、原样取」。已定下的部分：`habits` 的元素结构与
  `days[dayKey].checks`（打卡状态）由 `HABIT` 区定义，见
  `docs/features/habit/doc.md`；`days[dayKey]` 的其它兄弟键（`ledger` 等）
  由后续 feature 各自增补，本层对整个 `days` 是透传，不会因为多出键而丢数据。
