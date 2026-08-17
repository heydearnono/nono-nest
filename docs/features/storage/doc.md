# 数据模型与存储层

- 区名：`SAVE`（存档结构与读写）、`DAY`（自然日）、`IMPORT`（线上 JSON 导入）
- 模块：`miniprogram/utils/dayKey.js`、`miniprogram/utils/save.js`、`miniprogram/utils/importOnline.js`
- 状态：已完成（见 `summary.md`）。P4 追加了 `pet.lastFedAt`（`SAVE-12` / `IMPORT-10`），
  P6 追加了 `weekKeys`（`DAY-06` ~ `DAY-09`），P5 识字追加了 `dayKeyAfter`（`DAY-10` ~ `DAY-12`）
  与顶层键 `learningProgress`（`SAVE-13` / `IMPORT-11`），P3-b 追加了顶层键
  `lastWeeklyBonusWeek` 与 `redemptions` / `achievements` 的元素收敛
  （`SAVE-14` ~ `SAVE-16` / `IMPORT-12` / `IMPORT-13`），
  P5 古诗追加了 `learningProgress.guoxue`（`SAVE-17` / `IMPORT-14`），
  P5 数学追加了 `learningProgress.math`（`SAVE-18` / `IMPORT-15`），
  P7 第一段追加了 `parent` 的两个 PIN 水位（`SAVE-19` / `IMPORT-16`），
  **P7 第二段追加了 `habits` 的元素收敛与线上 `tasks` 的字段映射
  （`SAVE-20` ~ `SAVE-22` / `IMPORT-17`）、顶层键 `rewardFlags`
  （`SAVE-23` / `IMPORT-18`）**
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
dayKeyAfter(now, days) -> 'YYYY-MM-DD' // N 天后的日期键，0 就是今天

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

| 线上字段                   | 本仓库字段               | 说明                                                            |
| -------------------------- | ------------------------ | --------------------------------------------------------------- |
| `currency.stars`           | `currency.star`          | 单复数统一为单数                                                |
| `currency.gems`            | `currency.gem`           |                                                                 |
| `currency.foodPoints`      | `currency.petFood`       | 「份数」是界面说法，存的是点数                                  |
| `currency.medals`          | `currency.medal`         |                                                                 |
| `pet.satiety`              | `pet.fullness`           | 取值 0–5 原样保留，不换刻度                                     |
| —（线上没有）              | `pet.lastFedAt`          | 饱腹度衰减的基准，导入时落 `0`                                  |
| `pet.happiness`            | `pet.mood`               | 取值 0–5 原样保留                                               |
| `pet.level`                | `pet.petLevel`           | 避免与数学 `stage` 的层级概念混淆                               |
| `pet.exp`                  | `pet.petExp`             |                                                                 |
| `profile.name`             | `childName`              | 提到顶层，存档只服务一个孩子                                    |
| `profile.avatarEmoji`      | `childAvatar`            |                                                                 |
| `parentSettings.pin`       | `parent.pin`             |                                                                 |
| `parentSettings.dailyGoal` | `parent.dailyGoal`       | 本层夹到 `1` ~ `12`（线上只在设置页夹）                         |
| `parentSettings.note`      | `parent.note`            |                                                                 |
| —（线上没有）              | `parent.pinFails`        | PIN 连错次数，导入时落 `0`                                      |
| —（线上没有）              | `parent.pinLockedUntil`  | 冷却到期时刻，导入时落 `0`                                      |
| `dailyRecords`             | `days`                   | 键仍是 `dayKey`，格式不变                                       |
| `tasks`                    | `habits`                 | glossary 里 `habit` 指自律任务                                  |
| `tasks[].starsReward`      | `habits[].starReward`    | 元素也要映射，见 `IMPORT-17`                                    |
| `tasks[].foodPointsReward` | `habits[].petFoodReward` |                                                                 |
| `tasks[].subCategory`      | —（不接）                | 线上只写不读，本仓库无对应概念                                  |
| —（线上没有）              | `habits[].core`          | 今日全勤名单，导入时落 `false`                                  |
| `exchangeRecords`          | `redemptions`            | 元素也要映射，见 `IMPORT-12`                                    |
| `unlockedMedals`           | `achievements`           | 存的是成就 id，不是货币                                         |
| —（线上有但不接）          | `rewardFlags`            | 线上 `rewardRules` 默认全启用，映射恒等于默认值，见 `IMPORT-18` |
| `lastWeeklyBonusWeek`      | 同名                     | 周一的 `dayKey`，形状不变                                       |
| `createdAt` / `updatedAt`  | 同名                     | ISO 字符串转成毫秒数                                            |

`tasks` 那三行是 P7 第二段补的。**在此之前 `habits` 是整份透传的**
（`habits: onlineJson.tasks`），于是导入一份线上存档，18 条任务的产出值读不到
（`rewardOf` 读 `starReward`，线上是 `starsReward`）、`core` 全都缺席
（今日全勤永久不发）—— **合法但不生效**。详见 `docs/features/parent/doc.md`。

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
  habits: [],            // 自律任务定义，家长端可增改与停用。元素见 features/habit
  days: {},              // dayKey -> 当天记录
  redemptions: [],        // 兑换记录，最新在前。元素结构见 features/reward
  achievements: [],       // 已解锁成就 id
  rewardFlags: {},        // 兑换卡的启用开关，rewardId -> 布尔。缺键 = 启用（见 features/parent）
  lastWeeklyBonusWeek: '', // 上次发过周奖励的周键（weekKeys()[0]），空串 = 从未发过
  learningProgress: {     // 跨天的学习进度，各学习模块一个子键
    literacy: { chars: {} },   // 字 -> { step, due, wrong }，见 features/literacy
    guoxue: {                  // 见 features/poem
      poems: {},               // 诗 id -> { step, due, wrong, mastered }
      weekly: { weekKey: '', ids: [] },  // 本周三首的水位
    },
  },
  parent: {
    pin: '1234',          // 明文 4 位数字。忘了只能清空数据（见 features/parent）
    dailyGoal: 6,         // 每日完成几项算达标，1 ~ 12
    note: '',             // 家长备注，只在家长端显示
    pinFails: 0,          // PIN 连错次数，验对即清零。0 ~ 5
    pinLockedUntil: 0,    // 冷却到期的毫秒时间戳，0 = 没在冷却
  },
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

### 「N 天后」是哪一天：`dayKeyAfter`

P5 识字的复习调度要算「答对了，下次 4 天后再出现」。这与 `weekKeys` 是同一类判断：
它是**时间原语**，不是识字域的规则 —— 古诗那一轮要的是同一个东西
（线上 `oo()` 与 `co()` 共用同一个 `dayIndex`），所以它落在 `DAY` 区。

```js
dayKeyAfter(1754880000000, 0) -> '2026-08-12'   // 0 就是今天
dayKeyAfter(1754880000000, 30) -> '2026-09-11'
```

实现与 `weekKeys` 同一套：先把时刻**锚到当天中午**再 `setDate(+n)`，所以夏令时切换那天
加减一天不会跨到别的自然日（比如从 23:30 加 1 天可能只走 23 小时）；格式化仍复用 `dayKey`，
不写第二套补零。跨月与跨年由 `Date` 自己进位。

`days` 为负数是允许的（`dayKeyAfter(now, -1)` 是昨天），但必须是**整数** ——
`2.5` 天没有对应的日期键，是调用方算错了，所以抛 `RangeError`
而不是悄悄取整（与 `dayKey` 对非有限数抛 `TypeError` 同一条：编程错误要报错）。

### 跨天的学习进度：顶层键 `learningProgress`

线上 19 个顶层键里的 `learningProgress` 在 P1 被列为「本层不接」，理由是
「等那些 feature 定义了自己的结构再扩存档与映射表」。P5 识字就是第一个来扩的：

```js
learningProgress: {
  literacy: { chars: {} },   // 字 -> { step, due, wrong }
}
```

**只加 `literacy` 一个子键。** 国学与数学各自那一轮在同一个顶层键下加自己那份
（线上也是这个形状：`learningProgress` 下并列 `literacy` / `poems` / `math` / `reading` / `english`），
不再新增顶层键。**P5 古诗就是第二个来扩的**，加的是 `guoxue`（见下一节）；
**P5 数学是第三个也是最后一个**，加的是 `math`（见下下节）。三个子键之后
`learningProgress` 就满了 —— 阅读与英语在线上是死字段，不搬（见
`docs/features/learning/doc.md`）。

每条记录三个字段，收敛规则：`step` 夹到 `0` ~ `7` 的整数、`due` 只认
`YYYY-MM-DD` 形状的字符串（其余落空串）、`wrong` 夹成非负整数。
**为什么这一层要管收敛而不是像 `days` 那样透传**：`days` 的内部结构由各 feature 自己定义、
本层认不出好坏，而 `learningProgress.literacy.chars` 的三个字段就是三个数，
收敛在这里做一次，`utils/literacy.js` 的读取路径就不必每处再夹一遍。
调度语义（哪一档对应几天、什么算掌握）仍然在 `docs/features/literacy/doc.md`，本层不写那六个数字。

`days[key].learning.literacy` 是**另一回事**：那是「今天评了哪些字」，属于 `days` 透传的部分。
一个跨天累计，一个当天流水。

### 古诗的进度与本周三首：`learningProgress.guoxue`

```js
guoxue: {
  poems: { p1: { step: 2, due: '2026-08-16', wrong: 1, mastered: false } },
  weekly: { weekKey: '2026-08-10', ids: ['p1', 'p2', 'p3'] },
}
```

`poems` 与 `chars` 同构（一条记录，`step` / `due` / `wrong`），差别有两处：

- **`step` 的上界是 `5` 而不是 `7`。** 古诗的间隔表是四档（`docs/features/poem/doc.md`），
  识字是六档。本层因此有**两个上界常量**，不是一个 —— 「档位对应几天」由各自的
  feature 定义，本层只夹范围，而范围本来就不同。
- **多一个 `mastered` 布尔。** 它与 `step === 5` 说的是同一件事，是**刻意的冗余**：
  `ACHV` 区的 `poems_mastered` 判据在 `utils/reward.js` 里，而 `reward.js` 不能
  import `poem.js`（会成环），所以「会背了没有」必须是存档上直接读得出的事实。
  本层照 `step` 收敛它（`step === 5` 则为 `true`），而不是原样收下 ——
  两个字段矛盾时以 `step` 为准，仲裁规则只有一条。

`weekly` 是**水位**，与 `lastWeeklyBonusWeek`、`days[key].bonuses.allDone` 同一类：
它记的是「这一周锁定了哪三首」，不是可以重算的快照。`weekKey` 只认日期键形状
（与 `lastWeeklyBonusWeek` 同一条），`ids` 只留字符串。落空串或空数组的后果是
「下次读取时重选一次本周三首」，不会卡死。

**本层不校验 `ids` 里的 id 在不在诗库里** —— 那要 import `data/poems.js`，
而 `utils/save.js` 至今不 import 任何 `data/`。脏 id 由 `poemState` 在渲染时
挑掉（`POEM-32`）。这与「`chars` 里有不在字库里的字」是同一条处置。

### 数学的进度与当前阶段：`learningProgress.math`

```js
math: {
  rounds: { 'm1-1': { correct: true, wrong: 1 } },
  stage: 1,
}
```

**与 `chars` / `poems` 不同构** —— 数学**没有复习调度**，所以没有 `step` / `due`，
本层也**不加第三个上界常量**（古诗那轮拆出两个是因为两张间隔表不同；
数学没有间隔表，见 `docs/features/math/doc.md`）。

`rounds` 一道题一条，两个字段：`correct` 是「答对过没有」（布尔，**终态**，
答错不退回）、`wrong` 是答错次数。收敛规则：`correct` 只认布尔（其余落 `false`）、
`wrong` 夹成非负整数。非对象的记录整条丢掉。

`stage` 是**水位**（当前阶段），与 `guoxue.weekly`、`lastWeeklyBonusWeek` 同一类：
它可以从 `rounds` 推出来，但落盘的是「实际在第几阶段」而不是「应该在第几阶段」——
升阶要弹一句话，而那句话不能每次读取都弹一遍。收敛成 `1` ~ `6` 的整数
（**上界 `6` 是阶段数，不是档位**），坏值落 `1`。

**`stage` 与 `rounds` 矛盾时以 `stage` 为准**（`MATH-32`），仲裁规则只有一条 ——
与古诗那对冗余字段「以 `step` 为准」同一形状。脏存档里 `stage: 6` 而 `rounds` 是空的，
表现是「跳到最后一阶段」，不抛错、不打回第一阶段。

**本层不校验 `rounds` 里的 id 在不在题库里** —— 那要 import `data/mathRounds.js`，
而 `utils/save.js` 至今不 import 任何 `data/`。脏 id 由 `mathState` 在渲染时挑掉
（`MATH-33`），与 `chars` / `poems` 同一条处置。

### PIN 的两个水位：`parent.pinFails` / `pinLockedUntil`

```js
parent: { pin: '1234', dailyGoal: 6, note: '', pinFails: 0, pinLockedUntil: 0 }
```

前三个字段 P1 就有（线上 `parentSettings` 原样映射）。P7 第一段加后两个：
**PIN 连错 5 次冷却 60 秒**是线上没有的一条（线上输错无限次），
理由是威胁模型里那个真实的对手是 5 岁的孩子拿着这台手机穷举
（见 `docs/features/parent/doc.md`）。

两个都是**水位**不是设置项，所以落在 `parent` 里而不是新开顶层键 ——
它们与 `pin` 共同构成「这台机器现在让不让进家长端」这一件事。

- `pinFails` 夹到 `0` ~ `5`。上界是 `PIN_MAX_FAILS`：这个数只用来跟阈值比，
  存 `999` 与存 `5` 的行为一样，夹住只是不让脏存档把数字撑大。
- `pinLockedUntil` 存**到期时刻**而非「还剩几秒」：后者要有人每秒去减它，
  而存档不该有心跳。收敛成非负整数（与 `pet.lastFedAt` 同一条）。

`dailyGoal` 的上界本轮从 `+∞` 收到 **12**：线上设置页就是
`Math.min(12, Math.max(1, …))`，只是那道夹子在页面里、导入绕得过去 ——
一份 `dailyGoal: 99` 的存档会让家长端永远显示「差 99 项」。
夹子落到本层之后那条路径消失（`PARENT-22`）。

**两个新字段都不从线上来**（`IMPORT-16`）：线上没有节流，导入时落默认值 `0` / `0`，
与 `pet.lastFedAt` 同一条（本仓库新加的字段，导入落默认值而不是猜一个）。

`days[key].learning.math` 是**另一回事**（当天答过哪些题 + 答对几道），
属于 `days` 透传的部分。**线上那份记录里还有一个 `stage` 字段，全仓无一处读取，不搬。**

### 周奖励的水位：顶层键 `lastWeeklyBonusWeek`

P3-b 的周奖励一周只能发一次，所以要记「上次发过的是哪一周」。存的是
`weekKeys(now)[0]`，也就是**本周周一的 `dayKey`**（线上 `lastWeeklyBonusWeek` 同一形状）：

```js
lastWeeklyBonusWeek: '2026-08-10'; // 空串 = 从未发过
```

**为什么不存周序号（`2026-W33`）**：周序号要另写一套「今年第几周」的算术，跨年那一周
的归属还有两种流派（ISO 8601 与「1 月 1 日所在周」）。周一的日期键复用了 `weekKeys`，
不引入第二套时间口径 —— 与 `dayKey` 拒绝毫秒时间戳是同一条。

空串是「从未发过」而不是缺省错误：`'' !== 本周周键` 天然成立，所以第一周不需要特判
（与 `due` 用空串表示「立刻到期」同一条技巧）。

收敛规则与 `due` 一致：只认 `YYYY-MM-DD` 形状，其余落空串。落空串的后果是
「这周可能再发一次周奖励」，而落一个乱码的后果是「永远发不出去」——
宁愿多发一次也不要让奖励卡死（`docs/vision.md`「什么算好」第 2 条）。

### `redemptions` 与 `achievements` 的元素收敛

两个数组从 P1 起就在存档里，但一直是 `arr()` 原样透传、没有元素结构。
P3-b 是第一个写它们的人，所以本层开始收敛元素：

```js
redemptions: [
  { at: 1754880000000, rewardId: 'snack', name: '零食一次', icon: '🍪', medalCost: 2, status: 'pending' },
],
achievements: ['early-bird'],   // 成就 id 的字符串数组，去重
```

`redemptions` 的元素：非对象的丢掉；`at` / `medalCost` 收敛成非负整数；
`rewardId` / `name` / `icon` 收敛成字符串；`status` 只认 `'pending'` / `'done'`，
其余落 `'pending'`。**落 `'pending'` 而不是 `'done'`**：坏数据宁愿留在待兑现列表里
让家长看见，也不要悄悄变成「已经给过了」。

`name` / `icon` / `medalCost` 是**快照**（线上同样）：家长将来改了奖励的名字或价格，
历史记录仍显示当时兑的是什么、花了多少。所以本层不去 `data/rewards.js` 里查这三个值。

`achievements` 只保留字符串且去重 —— 它是 `includes` 判断「解锁过没有」的依据，
重复项会让奖励中心的已解锁计数虚高。

**为什么这两个数组要收敛而 `days` 不用**：`days` 的内部结构由各 feature 各自定义，
本层认不出好坏；而这两个数组的元素字段就是几个数和几个字符串，收敛在这里做一次，
`utils/reward.js` 的读取路径不必每处再夹一遍（与 `learningProgress.literacy.chars` 同一条）。

**`habits` 原本也在这份「不收敛」名单里，P7 第二段把它接进来了**（见下节）——
接的理由不是「本层终于认得出它的元素」，而是**它第一次有了写入路径**：
在家长端能改 `habits` 之前，那个数组的每一个元素都来自
`data/defaultHabits.js`（转抄的常量）或线上导出的 JSON，本层收敛不出任何东西；
家长端能改之后，同一个数组开始接收输入框里的值。
**「本层要不要收敛某个字段」由「有没有人往里写」决定，不由「字段长得像不像数据」决定。**

**元素的语义**（什么算兑换成功、状态怎么流转、勋章什么时候扣）在
`docs/features/reward/doc.md`，本层只管形状。

### `habits` 的元素收敛（`SAVE-20` ~ `SAVE-22`，P7 第二段）

家长端第二段给了 `habits` 三个写入路径（`saveHabit` / `addHabit` / `moveHabit`），
所以本层开始收敛它的元素。字段清单与各自的默认值：

```js
habits: [
  {
    id: 'wake',
    name: '按时起床',
    icon: '🌅',
    category: 'habit',
    frequency: 'daily',
    starReward: 1,
    petFoodReward: 1,
    needsParentConfirm: false,
    enabled: true,
    sortOrder: 1,
    core: true,
  },
  // learning 类多一个 module，frequency: 'weekly' 的多一个 weeklyTarget
];
```

| 字段                 | 收敛                                         | 坏值落                           |
| -------------------- | -------------------------------------------- | -------------------------------- |
| `id`                 | 非空字符串                                   | **整条元素丢掉**                 |
| `name`               | 非空字符串                                   | `'未命名'`                       |
| `icon`               | 非空字符串                                   | `'⭐'`（线上新增表单的默认图标） |
| `category`           | `habit` / `learning` / `health` 之一         | `'habit'`                        |
| `frequency`          | `daily` / `weekly` 之一                      | `'daily'`                        |
| `starReward`         | `0` ~ `10` 整数                              | `1`                              |
| `petFoodReward`      | `0` ~ `10` 整数                              | `1`                              |
| `needsParentConfirm` | 布尔                                         | `false`                          |
| `enabled`            | 布尔                                         | `true`                           |
| `sortOrder`          | 非负整数                                     | `0`                              |
| `core`               | 布尔                                         | `false`                          |
| `module`             | 非空字符串，**仅 `category === 'learning'`** | 缺席（不补）                     |
| `weeklyTarget`       | 正整数，**仅 `frequency === 'weekly'`**      | 缺席（不补）                     |

**三处与 `redemptions` 不同：**

**`id` 坏就整条丢掉**（`redemptions` 是「非对象整条丢掉」，坏 `id` 只落空串）。
没有 id 的任务打不了卡（`checks` 按 id 存）、也改不了（`saveHabit` 按 id 找），
留着只是让首页多一个点不动的格子。**重复 id 也只留第一条** ——
两条同 id 的任务会共享同一个打卡状态，界面上是「点一个亮两个」。

**两个字段是条件保留的。** 无条件补默认值会让 18 条里 13 条多一个 `module: ''`，
而 `learning.js::habitOf` 用 `find(item => item.module === module)` 找任务 ——
一堆空串会在有人不小心传空串时匹配到第一条。**条件字段不补，是为了让缺席保持缺席。**

**`enabled` 的坏值落 `true`。** 与 `status` 落 `'pending'` 是同一种考量的相反方向：
那里是「宁愿让家长看见」，这里是「宁愿让孩子看见那一格」——
不明不白地少一个打卡项，比多一个更难发现（首页九格少一格没人会注意，
而进度分母也跟着变，`dayProgress` 显示的「今天 5/8」是错的却看不出错）。

**上界 `10` 不是防溢出，是防通胀。** 一次打卡 999 星光会让兑换那条链失去参照
（详见 `docs/features/parent/doc.md`）。下界 `0` 是合法值：`rewardOf` 落 0 就是不发，
那是一条「只记录不奖励」的任务。

`save.js` **零 import**（`seedHabits` 因此在 `habit.js`），所以这层的默认值是字面量
`'habit'` / `'daily'` / `'⭐'`，**不回查 `data/defaultHabits.js`**。
三个类别与两个 frequency 各是一个模块级常量数组，与 `REDEMPTION_STATUS` 同形。

**本层只管形状，不管名单。** 哪七条是 `core`、哪些字段家长能改、`sortOrder` 怎么重排，
都在 `docs/features/habit/doc.md` 与 `docs/features/parent/doc.md`。

### 兑换卡的启用开关：顶层键 `rewardFlags`（`SAVE-23`，P7 第二段）

```js
rewardFlags: { snack: true, cartoon: true, money: false },
```

`rewardId` → 布尔。**默认是空对象，缺键当启用** —— 一张没被明确停用的卡应该能换，
写成「缺键 = 停用」会让存档里还没有这个键的用户一张卡都换不了。

为什么不把三条卡整份搬进存档（线上 `rewardRules` 的做法）：那样
`medalCost` 就跟着可写了，而**改价本轮明确不做**（`REWARDS` 是常量，
`redemptions` 里的价格是快照）。只存一个布尔，改价想做也没有落点。

**收敛只做「值收敛成布尔」，未知 id 原样留着**：本层不能 import `data/rewards.js`
（零依赖），认不出哪个 id 是登记过的。留着不删与 `days` 的透传同一条 ——
本层不认得的键不删（删了就丢数据），只是没人读；忽略未知 id 的是
`utils/reward.js` 的读取路径（`REWARD-16`）。

非对象的 `rewardFlags`（数组、`null`、字符串）整份落空对象。

`rewardFlags` **不从线上来**（`IMPORT-18`）：线上的 `rewardRules` 是三条卡的完整定义，
本仓库只要其中一个布尔 —— 而那三条卡在线上默认全 `enabled: true`，
映射过来恒等于默认值。**不接一个恒等于默认值的映射**，与 `pet.lastFedAt` /
`parent.pinFails` 同一条（线上没有对应概念，导入不猜）；区别是这一条
线上**有**数据，只是搬过来没有信息量。

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
| DAY-10  | `dayKeyAfter(2026-08-12 的某个时刻, 0)`     | `'2026-08-12'`（`0` 就是今天）                     |
| DAY-11  | `dayKeyAfter(2026-08-12 的某个时刻, 30)`    | `'2026-09-11'`，跨月正确                           |
| DAY-12  | `dayKeyAfter` 的 `days` 为 `2.5`            | 抛 `RangeError`；`now` 非有限数抛 `TypeError`      |

跨日以**本机时区 0 点**为界，不用 UTC。线上就是这么做的，改成 UTC 会让晚上 8 点后的
打卡算到第二天。

`DAY-07` 是这四条里唯一容易写错的：`getDay()` 的周日是 `0`，直接用 `1 - 0` 会把周日
推到**下一周**的周一，于是「周日晚上洗了澡」算进了还没开始的那一周。所以周日单独走 `-6`。

### 存档默认值与补齐（`SAVE`）

| Spec ID | 输入                                                                                                                                                                                                        | 期望输出                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAVE-01 | `normalizeSave(undefined)`（首次进入）                                                                                                                                                                      | 等于 `defaultSave()`                                                                                                                                                                                                          |
| SAVE-02 | 只含 `currency.star` 的对象                                                                                                                                                                                 | 其余字段取默认值，`star` 保留传入值                                                                                                                                                                                           |
| SAVE-03 | `currency` 中缺 `petFood`                                                                                                                                                                                   | `petFood` 补 `0`，不是 `undefined`                                                                                                                                                                                            |
| SAVE-04 | 非对象输入（数字 / 字符串 / 数组 / `null`）                                                                                                                                                                 | 等于 `defaultSave()`，不抛错                                                                                                                                                                                                  |
| SAVE-05 | `pet.fullness` 为 `9`（越界）                                                                                                                                                                               | 收敛到 `5`                                                                                                                                                                                                                    |
| SAVE-06 | `pet.fullness` 为 `-1`                                                                                                                                                                                      | 收敛到 `0`                                                                                                                                                                                                                    |
| SAVE-07 | `pet.fullness` 为 `2.7`（非整数）                                                                                                                                                                           | 收敛到 `3`（四舍五入）                                                                                                                                                                                                        |
| SAVE-08 | `pet.petLevel` 为 `0`                                                                                                                                                                                       | 收敛到 `1`（等级从 1 开始）                                                                                                                                                                                                   |
| SAVE-09 | `currency.star` 为 `-5`                                                                                                                                                                                     | 收敛到 `0`（货币非负）                                                                                                                                                                                                        |
| SAVE-10 | 含未知顶层字段 `foo`                                                                                                                                                                                        | 丢弃 `foo`，不写进结果                                                                                                                                                                                                        |
| SAVE-11 | `days` 中含一条合法日期键                                                                                                                                                                                   | 原样保留该键与其内容                                                                                                                                                                                                          |
| SAVE-12 | `pet.lastFedAt` 缺失 / 为负 / 非数值                                                                                                                                                                        | 补 `0`，不是 `undefined`                                                                                                                                                                                                      |
| SAVE-13 | `normalizeSave({})` / `defaultSave()`                                                                                                                                                                       | `learningProgress.literacy.chars` 为 `{}`；`step` 为 `99` / `-1` / `'2'` 时夹到 `0` ~ `7`，`wrong` 为 `-3` 时夹成 `0`                                                                                                         |
| SAVE-14 | `lastWeeklyBonusWeek` 缺失 / 非日期键形状                                                                                                                                                                   | 落空串（含义是「从未发过周奖励」），不是 `undefined`                                                                                                                                                                          |
| SAVE-15 | `redemptions` 含一条脏元素（`status` 为 `'weird'`、`medalCost` 为 `-2`、多一个未知字段）                                                                                                                    | `status` 落 `'pending'`、`medalCost` 夹成 `0`、未知字段被丢弃；非对象的元素整条丢掉                                                                                                                                           |
| SAVE-16 | `achievements` 为 `['a', 'a', 7, null]`                                                                                                                                                                     | 收成 `['a']`（去重，且只留字符串）                                                                                                                                                                                            |
| SAVE-17 | `normalizeSave({})` / `defaultSave()`                                                                                                                                                                       | `learningProgress.guoxue` 为 `{ poems: {}, weekly: { weekKey: '', ids: [] } }`；`step` 夹到 `0` ~ `5`（不是 `7`）、`mastered` 照 `step === 5` 收敛（矛盾时以 `step` 为准）、`weekly.weekKey` 只认日期键形状、`ids` 只留字符串 |
| SAVE-18 | `normalizeSave({})` / `defaultSave()`                                                                                                                                                                       | `learningProgress.math` 为 `{ rounds: {}, stage: 1 }`；`stage` 为 `99` / `-1` / `'2'` 时夹到 `1` ~ `6`、`rounds` 的 `correct` 只认布尔、`wrong` 为 `-3` 时夹成 `0`、非对象的记录整条丢掉                                      |
| SAVE-19 | `normalizeSave({})` / `defaultSave()`                                                                                                                                                                       | `parent` 为 `{ pin: '1234', dailyGoal: 6, note: '', pinFails: 0, pinLockedUntil: 0 }`；`pinFails` 为 `-3` / `99` 时夹到 `0` ~ `5`、`pinLockedUntil` 为负时落 `0`、`dailyGoal` 为 `99` 时夹到 `12`（`0` 夹到 `1`）             |
| SAVE-20 | `habits` 含一条脏元素（`name` 为 `'  '`、`icon` 为 `''`、`category` 为 `'weird'`、`starReward` 为 `99`、`petFoodReward` 为 `-3`、`enabled` 为 `'yes'`、`core` 为 `1`、`sortOrder` 为 `-2`、多一个未知字段） | `name` 落 `'未命名'`、`icon` 落 `'⭐'`、`category` 落 `'habit'`、`frequency` 落 `'daily'`、`starReward` 夹到 `10`、`petFoodReward` 夹成 `0`、`enabled` 落 `true`、`core` 落 `false`、`sortOrder` 落 `0`、未知字段被丢弃       |
| SAVE-21 | `habits` 含 `id` 为空串 / 非字符串 / 缺失的元素，一个非对象元素，以及两条 `id` 都是 `'wake'` 的元素                                                                                                         | 前三条与非对象元素**整条丢掉**；重复 `id` 只留第一条                                                                                                                                                                          |
| SAVE-22 | `habits` 含 `category: 'learning'` 且 `module: 'poem'` 的一条、`category: 'habit'` 的一条、`frequency: 'weekly'` 且 `weeklyTarget: 3` 的一条、`frequency: 'daily'` 且 `weeklyTarget: 3` 的一条              | `module` 只在 `learning` 那条上存在（`habit` 那条**没有这个键**，不是空串）；`weeklyTarget` 只在 `weekly` 那条上存在（`daily` 那条**没有这个键**）                                                                            |
| SAVE-23 | `normalizeSave({})` / `defaultSave()`；以及 `rewardFlags` 为 `{ snack: 0, cartoon: 'x', money: false, zzz: true }` / 为数组 / 为 `null`                                                                     | 默认落 `{}`（缺键 = 启用）；值收敛成布尔（`0` → `false`、`'x'` → `true`）、**未知 id `zzz` 原样留着**；非对象整份落 `{}`                                                                                                      |

存档来自 storage，可能被手改或被旧版本写坏，所以 `normalizeSave` **不抛错**：
一律收敛到合法值。这与 `utils/` 里其它纯函数对非法入参抛 `RangeError` 的约定不同 ——
存档读取失败就白屏，违反「什么算好」第 2 条（不清零、不惩罚）。
唯一抛错的是 `dayKey`：那是编程错误，不是用户数据问题。

### 线上 JSON 导入（`IMPORT`）

| Spec ID   | 输入                                                                                                                               | 期望输出                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMPORT-01 | 含 `currency.stars/gems/foodPoints/medals`                                                                                         | 映射到 `star/gem/petFood/medal`，数值不变                                                                                                                                                                                                                                                                        |
| IMPORT-02 | 含 `pet.satiety/happiness/level/exp`                                                                                               | 映射到 `fullness/mood/petLevel/petExp`                                                                                                                                                                                                                                                                           |
| IMPORT-03 | 含 `profile.name`                                                                                                                  | 映射到顶层 `childName`                                                                                                                                                                                                                                                                                           |
| IMPORT-04 | 含 `dailyRecords` 的两个日期键                                                                                                     | 原样成为 `days` 的两个键                                                                                                                                                                                                                                                                                         |
| IMPORT-05 | 含 `unlockedMedals: ['early-bird']`                                                                                                | 成为 `achievements: ['early-bird']`                                                                                                                                                                                                                                                                              |
| IMPORT-06 | 含 `pet.unlockedDecor`                                                                                                             | 丢弃该字段                                                                                                                                                                                                                                                                                                       |
| IMPORT-07 | 空对象 `{}`                                                                                                                        | 等于 `defaultSave()`，不抛错                                                                                                                                                                                                                                                                                     |
| IMPORT-08 | 非对象输入                                                                                                                         | 抛 `TypeError`（导入是用户主动动作，要报错）                                                                                                                                                                                                                                                                     |
| IMPORT-09 | `createdAt` 为 ISO 字符串                                                                                                          | 转成毫秒数；无法解析时取默认值 `0`                                                                                                                                                                                                                                                                               |
| IMPORT-10 | 任意线上 JSON                                                                                                                      | `pet.lastFedAt` 为 `0`（线上无此字段）                                                                                                                                                                                                                                                                           |
| IMPORT-11 | 线上 `learningProgress.literacy` 的五个结构                                                                                        | 映射成 `chars`：在 `masteredChars` 里的落 `step: 7` / `due: ''`；在 `charReviewSchedule` 里的落 `step: 0` / `due` 取那六个日期里最早的；只在 `reviewChars` / `learnedChars` 里的落 `step: 0` / `due` 为 `''`；`charWrongCounts` 原样进 `wrong`                                                                   |
| IMPORT-12 | 含 `exchangeRecords` 的一条 `approved` 记录                                                                                        | 成为 `redemptions` 的一条，`status` 为 `'done'`；`pending` 仍是 `'pending'`；`rejected` 的整条**丢掉**（本仓库没有「已取消」这个状态）                                                                                                                                                                           |
| IMPORT-13 | 含 `lastWeeklyBonusWeek: '2026-08-10'`                                                                                             | 原样落进同名顶层键；线上无此键时落空串                                                                                                                                                                                                                                                                           |
| IMPORT-14 | 线上 `learningProgress.guoxue` 的三个结构                                                                                          | 映射成 `poems`：在 `masteredPoems` 里的落 `step: 5` / `due: ''` / `mastered: true`；在 `reviewSchedule` 里的落 `step: 0` / `due` 取那六个日期里最早的；只在 `learnedPoems` 里的落 `step: 0` / `due` 为 `''`。`weekly` **不从线上来**（线上不落盘），落空水位                                                     |
| IMPORT-15 | 线上 `learningProgress.math` 的四个字段                                                                                            | `currentStage` → `stage`（夹到 `1` ~ `6`）；`gamesCompleted` / `stagePlayed` / `stageCorrect` **三个都不接**（数的是次数，本仓库数的是哪些题），`rounds` 落空对象 —— 线上没有「答对过哪些题」这笔数据                                                                                                            |
| IMPORT-16 | 线上 `parentSettings` 的三个字段                                                                                                   | `pin` / `dailyGoal` / `note` 原样映射（`dailyGoal: 99` 夹到 `12`）；`pinFails` / `pinLockedUntil` **两个都落 `0`** —— 线上没有节流，与 `pet.lastFedAt` 同一条                                                                                                                                                    |
| IMPORT-17 | 线上 `tasks` 的一条 `learning` 元素（`starsReward: 2` / `foodPointsReward: 2` / `subCategory: 'chinese'`，无 `core`、无 `module`） | `starsReward` → `starReward`、`foodPointsReward` → `petFoodReward`；`subCategory` **不接**；`core` 落 `false`（线上没有这个概念，**不按 id 猜**）；`id` / `name` / `icon` / `category` / `frequency` / `needsParentConfirm` / `enabled` / `sortOrder` 原样映射；`weeklyTarget` 只在 `frequency: 'weekly'` 时保留 |
| IMPORT-18 | 任意线上 JSON（含完整 `rewardRules`）                                                                                              | `rewardFlags` 为 `{}`（**整份不接**）—— 线上三条卡默认全 `enabled: true`，映射过来恒等于「缺键 = 启用」；`medalCost` 不进存档（`REWARDS` 是常量，改价不做）                                                                                                                                                      |

导入与读存档的错误策略相反：**导入非法数据要报错**。用户是主动粘贴 JSON 的，
静默用默认值会让他以为导入成功了，实际清零 —— 那正是迁移要避免的事故。

`IMPORT-10` 是本仓库多出来的字段落在导入路径上的样子：`pet.lastFedAt` 线上不存在，
所以映射表里没有它的来源行，落 `0` 由 `normalizeSave` 完成。`0` 的含义是
「还没有衰减基准」，导入后第一次打开宠物页会把基准立成当时 ——
导入不会让 nono 的小伙伴一进来就是饿的（见 `docs/features/pet/doc.md` 的 `FULLNESS-01`）。

线上多出来的 8 个顶层键（`pointRules` `rewardRules` `medalProgress` `stickerCollection`
`lastFreeStickerDate` `lastWeeklyBonusWeek` 及其内部字段）本层**不接**：
它们属于后续 feature（`POINT` / `REWARD` / `ACHV` / `STICKER`），
等那些 feature 定义了自己的结构再扩存档与映射表。这条是刻意的取舍，不是遗漏 ——
先把线上 JSON 原文留在用户手上，导入可以重跑。

`learningProgress` 原本也在这份「不接」名单里，P5 识字把它接进来了一半：
只映射 `learningProgress.literacy`（`IMPORT-11`），线上同层的 `poems` / `math` /
`reading` / `english` 仍不接，各自那一轮再来。所以名单从 9 个减到 8 个。
**P5 古诗又接走了 `guoxue`（`IMPORT-14`）**，**P5 数学接走了最后一个 `math`
（`IMPORT-15`）** —— `learningProgress` 于是彻底接完：剩下的 `reading` / `english`
两个子键在线上是只写不读的死字段（见上文），**永久不接**。

`IMPORT-14` 有一处线上没有对应来源：`wrong` 落 `0` —— 线上古诗**没有错误计数**
（没有「还没背下来」这个入口）。这不是丢数据，是线上确实没有这笔数据。
`weekly` 同理落空水位：线上的本周三首是每次现算的，没有字段可搬。

`IMPORT-15` 是**丢得最多的一条**，而且是刻意的：线上四个字段里只接
`currentStage`，另外三个（`gamesCompleted` / `stagePlayed` / `stageCorrect`）数的是
**答了几次**，而本仓库数的是**答对过哪些题**（`docs/features/math/doc.md`）——
次数换不出题目，所以 `rounds` 落空对象。代价是导入后「答对过的题」从零开始，
但 `stage` 认下来了：孩子不会被打回第一阶段（「什么算好」第 2 条）。

P3-b 又从名单里接走了 `lastWeeklyBonusWeek`（`IMPORT-13`），并给早就存在的
`exchangeRecords` → `redemptions` 加上了元素映射（`IMPORT-12`）。
剩下**四个仍不接**：`pointRules`、`rewardRules`、`medalProgress`、
`stickerCollection` 与 `lastFreeStickerDate`（贴纸单独一轮）。
**P7 第二段把前三个里的两个判成永久不接**：

- `pointRules` **永久不接** —— 线上是一张全局费率表（`taskComplete: { stars: 1 }`），
  而本仓库的产出值长在任务身上（`habits[].starReward`），第二段给的正是**逐条改**
  那两个值的入口。一张全局表在本仓库没有落点，导入它等于凭空多一层
  谁都不读的配置（见 `docs/features/point/doc.md`）。
- `rewardRules` **永久不接** —— 第二段只接了它的 `enabled`，而且是
  **接成本仓库自己的 `rewardFlags` 而不是搬那三条卡**（`IMPORT-18` 落空对象）。
  `medalCost` 归常量、`name` / `icon` 归常量，改价不做，所以整份定义没有来源可言。
- `medalProgress` **永久不接** —— 本仓库的成就进度每次从存档现算，不存中间值
  （见 `docs/features/reward/doc.md`）。

**三条永久不接的理由不是同一个**，值得分开记：`medalProgress` 是**本仓库没有这个字段**，
`pointRules` 是**本仓库把这笔数据放在了另一层**（任务元素上），
`rewardRules` 是**本仓库只要它的一个布尔，而那个布尔恒等于默认值**。
第三种最容易误判成「该接」—— 线上确实有数据、字段名也对得上，
但搬过来一条信息都不增加。

`IMPORT-16` 是 P7 第一段补的，也是**全仓第一次真的有人调 `importOnlineSave`**：
在此之前 15 条导入规格全绿而**零调用点**，nono 线上的进度搬不过来。
`parentSettings` 三个字段从 P1 起就在映射表里，本轮只是把 `dailyGoal` 的夹子
从页面挪进本层（线上那道 `Math.min(12, …)` 在设置页里，导入绕得过去），
再给两个本仓库新加的水位字段落默认值。

`IMPORT-17` 补的是第一段暴露出来的那个洞：**调用点接上之后才发现导入的存档
「合法但不生效」**。`habits: onlineJson.tasks` 这一行从 P1 就在，15 条规格里
`IMPORT-01` 只断言了 `toHaveLength(1)` 与 `habits[0].id === 'wake'` ——
两条都过，而 `starsReward` 没改名、`core` 全缺席。
**教训与 P5 数学那条同形**（`math_games` 读了一个两边都不存在的字段名）：
只断言长度与 id 的规格，挡不住「元素里每个字段都是错的」。
**元素映射的规格必须至少断言一个改了名的字段和一个本仓库独有的字段。**

## 范围外

- 不做双向同步。导入是一次性动作，导入后线上数据不再是来源。
- 不做存档版本迁移。`version` 字段先占位，`version !== 1` 的处理留到真的出现第 2 版时再写
  （线上的 `version` 也从未有过迁移分支）。
- 不做加密。家长 PIN 在线上是明文存在同一份可导出 JSON 里的，本仓库沿用 ——
  家庭自用场景下，加密带来的复杂度换不到实际安全收益。这一点在 `PARENT` 区的
  `doc.md` 里要再说明一次。
- 不写具体业务规则的公式（打卡产出、升级、复习调度）。
- 不做 `days` 内部结构的完整规格 —— 那些字段由各自的 feature 定义，
  本层只保证「原样存、原样取」。`days[dayKey].checks`（打卡状态）由 `HABIT` 区定义，
  见 `docs/features/habit/doc.md`；`days[dayKey]` 的其它兄弟键（`ledger` 等）
  由后续 feature 各自增补，本层对整个 `days` 是透传，不会因为多出键而丢数据。
  **`habits` 原本与 `days` 并列在这一条里，P7 第二段把它移出去了**（`SAVE-20` ~ `SAVE-22`）——
  移出的时点是它有了写入路径，不是它的结构变清楚了（结构从 P2 起就没变过）。
- 不做 `habits` 元素的**语义**规格：哪七条是 `core`、哪些字段家长能改、`sortOrder`
  怎么重排、新增任务的 id 怎么生成，分别在 `docs/features/habit/doc.md` 与
  `docs/features/parent/doc.md`。本层只管形状与默认值。
- 不做 `rewardFlags` 的未知 id 清理 —— 本层不能 import `data/rewards.js`，
  认不出登记过的 id。清理不做（删了就丢数据），忽略由 `utils/reward.js` 的读取路径完成。
