# 勋章闭环（兑换 · 成就 · 奖励结算）

- 区名：`REWARD`（奖励项与兑换流程、奖励结算入口）、`ACHV`（成就判定与解锁）
- 模块：`miniprogram/data/rewards.js`、`miniprogram/data/achievements.js`、
  `miniprogram/utils/reward.js`、`miniprogram/pages/reward/`
- 状态：已完成
- 关联愿景：`docs/vision.md` P3 的第二段（P3-b）
- 顺带产出：`POINT` 区追加今日全勤与周奖励（`POINT-20` ~ `POINT-31`）、
  `data/defaultHabits.js` 的元素加 `core` 字段、`checkAwardAndGrow` 成为唯一结算入口

## 背景

P3-a 把打卡接上了星光与宠物粮，但**勋章恒为 0**：它只有两个产出点（今日全勤、成就解锁），
两者都要求核心打卡项有入口。`docs/features/point/doc.md`「范围外」第 1 条写明
「等这两个页面落地后一起做，届时还要加『周』的键」—— P5 首段补上 `reading`、
P6 补上 `exercise` / `vegetables` / `poop` / `bath`、P5 识字补上 `literacy`，
核心 id 现在全都有入口了，本轮就是那个「一起做」。

勋章恒为 0 的直接后果是整条动机链断在中间：打卡 → 星光（有）→ 勋章（无）→ 兑换（换不了）。
本轮把后两段接上，链条才第一次闭合。

线上的对应实现（从 bundle 逆向，已逐条核对）：

| 项       | 线上做法                                                                              |
| -------- | ------------------------------------------------------------------------------------- |
| 核心 id  | `rr = ['brush-am','wake','literacy','reading','exercise','vegetables','poop','bath']` |
| 全勤判据 | `rr.every(id => 当天 completedTasks[id]?.completed)`，八条全满                        |
| 全勤发放 | `+1 勋章`，流水 `今日全勤（8项打卡满）`，去重靠 `bonuses.dailyAllDone`                |
| 达标日   | `rr.filter(完成).length >= 5`，即八条里完成五条                                       |
| 周奖励   | `pointRules.weeklyBonus = { stars: 5, gems: 1, minDays: 5 }`，一周发一次              |
| 周去重   | `lastWeeklyBonusWeek === mr()[0]`（本周周一的日期键）                                 |
| 奖励项   | `rewardRules` 三条：`snack` 2 / `cartoon` 3 / `money` 5，都 `needsConfirm: true`      |
| 申请兑换 | `requestExchange`：勋章够就 `unshift` 一条 `status: 'pending'`，**此时不扣勋章**      |
| 家长批准 | `approveExchange`：再查一次勋章够不够 → 扣勋章、`status: 'approved'`                  |
| 家长驳回 | `rejectExchange`：`status: 'rejected'`，勋章从未扣过所以不退                          |
| 成就表   | `ir` 十一条，元素 `{ id, name, icon, description, condition, threshold }`             |
| 成就判定 | 每次打卡后全表扫一遍，进度写进 `medalProgress[id]`，达阈值则解锁并 `+1 勋章`          |
| 成就流水 | **没有**。解锁给的勋章不进流水                                                        |

线上这一块的问题比前几轮多，其中四处直接决定了本轮的取舍：

1. **`bath` 在全勤名单里，但它是唯一的周任务**（`frequency: 'weekly'`、`weeklyTarget: 3`）。
   要求一个「一周洗三次」的任务每天打满，与它自己的定义矛盾 —— 于是线上的今日全勤
   在不洗澡的日子结构性地不可能达成。
2. **申请兑换不扣勋章，批准时才扣。** 中间孩子把勋章花掉，这条 pending 就**永远批不了**
   （`approveExchange` 里 `勋章 < medalCost` 直接 return，既不提示也不删记录）。
   兑换记录页会积累一批看不出为什么点不动的条目。
3. **成就解锁的勋章不进流水。** 全勤的 `+1🏅` 有流水、成就的 `+1🏅` 没有，
   于是「流水加起来等于余额」这个不变式在线上不成立。
4. **`medalProgress` 存了进度快照，但解锁后不再更新**（`if (已解锁) continue` 在写进度之前），
   所以已解锁成就的进度条永远停在解锁那一刻的数值。

另外两处口径不一致：「一周打卡达标」在周奖励里是「八条核心里完成五条」，
在 `full-week` 成就里是「自律 + 学习任务的 60%」，两套判据算同一件事。
`learnedChars` 与 `medalProgress` 一样是只写不读或写了不准的字段。

## 设计

### 全勤名单收敛成七条：去掉 `bath`

```js
CORE_HABIT_IDS = ['wake', 'brush-am', 'literacy', 'reading', 'exercise', 'vegetables', 'poop'];
```

**这是本轮第一处偏离线上**，理由就是上文第 1 条：`bath` 的 `weeklyTarget: 3` 与
「每天打满」互相矛盾，而 `docs/features/health/doc.md` 已经把它定成「每次打开都发放、
周目标只喂给标题上的分母」。留着它等于让今日全勤在一周里有四天不可能达成。

达标日的阈值**仍是 5**（线上同一个数）。分母从八减到七，5/7 比 5/8 略宽松 ——
刻意不动那个数：改它要重新拍板，而偏宽松的方向符合「温和，不惩罚」。

名单落在**任务元素的 `core` 字段**上，不落在 `utils/` 的常量数组里：

```js
{ id: 'wake', name: '按时起床', …, core: true }
```

线上 `rr` 是一个独立数组，与 `tasks` 各存一份 —— 家长删掉 `poop` 之后 `rr` 里还有它，
全勤于是永久不可能达成（这是问题 1 的同一个病根）。写成任务自己的字段之后，
「哪些算核心」与「这条任务还在不在、还启用不启用」是同一份数据，不会各说一套。
这与 `POINT` 区「读任务自身的 `starReward` 而不查 `pointRules`」是同一条判断。

代价是 `data/defaultHabits.js` 的元素多一个字段，且 P7 家长端多一个可编辑项。

### 全勤的分母跟着启用状态变

家长停用或删掉某条核心任务时，它**不计入分母**：剩下几条打满就算全勤
（与 `dayProgress` 的分母跟着启用状态变是同一条）。七条全被停用时**不算全勤** ——
否则一条任务都没有的存档天天全勤，每天白发一枚勋章。

`bonuses` 是 `days[key]` 的第五个兄弟键（`checks` / `ledger` / `health` / `learning` / `bonuses`），
存 `{ allDone: true }`，含义是「今天这枚全勤勋章已经发过了」。
`SAVE` 区对整个 `days` 是透传，不为它加收敛。

**全勤后取消一项打卡，勋章不退、`bonuses.allDone` 不清。** 与「取消打卡不收回宠物经验」
同一条（`docs/features/pet/doc.md`），也是「温和，不惩罚」的直接推论。
代价是当天可以「打满 → 取消 → 再打满」而勋章只发一次 —— 这正是想要的，
`bonuses.allDone` 就是那个水位。

### 周奖励：一周一次，水位是周一的日期键

```js
WEEKLY_BONUS = { star: 5, gem: 1, minDays: 5 };
```

数字抄线上。「达标日」是**当天核心项里完成 ≥ 5 条**，本周七天里达标 ≥ 5 天就发一次
`+5⭐ +1💎`，然后把 `lastWeeklyBonusWeek` 写成 `weekKeys(now)[0]`。

**达标日的判据只有一个函数**，周奖励与 `full-week` 成就共用它。线上那两套口径
（核心项 5/8 与「自律 + 学习的 60%」）算的是同一件事，却能给出不同答案 ——
这与 P5 识字那一轮的教训同一条：**共用判据要共用的是函数，不是「调用另一个入口」**。

宝石是本仓库唯一由周奖励独占产出的货币（`docs/glossary.md` 已写明「只由周奖励产出」），
所以周奖励不发它就等于宝石永远是 0。

### 兑换：申请即扣勋章，记录停在「待家长兑现」

**这是本轮第二处偏离线上**，修的是上文问题 2。

```js
redemptions: [
  {
    at: 1754880000000,
    rewardId: 'snack',
    name: '零食一次',
    icon: '🍪',
    medalCost: 2,
    status: 'pending',
  },
];
```

申请时就扣勋章，记录直接落 `status: 'pending'`（界面上叫「待家长兑现」）。
两个收益：

- **没有「永远批不了的 pending」**：勋章在申请那一刻就已经不在余额里了。
- **本轮不需要审批入口**。家长端要 P7 才做，若沿用「批准时扣」，本轮就得写一个
  没有任何调用点的 `approveExchange` —— 那是 `AGENTS.md` 第 5 节第 4 条明令不做的事。

代价：孩子申请后反悔、或家长最终没兑现，勋章不会自动回来。这是刻意的 ——
「说出口就算数」对 5 岁孩子是更清楚的规则，而撤销入口本身也要等 P7。

`status` 的 `'done'` 本轮**没有写入路径**，但它不是死值：`IMPORT-12` 把线上
`approved` 的历史记录映射成 `'done'`，导入后兑换记录页要能显示它。P7 加上「家长确认」
按钮时它才有第二个来源。

`name` / `icon` / `medalCost` 是**快照**（线上同样）：家长将来改了奖励的名字或价格，
历史记录仍显示当时兑的是什么、花了多少。所以 `redeem` 把这三个值写进记录，
读取路径不去 `data/rewards.js` 回查（收敛规则见 `docs/features/storage/doc.md`）。

勋章不够时**原样返回**（对象同一性），不抛错 —— 页面按 `rewardState().items[].affordable`
把按钮置灰，与 `petState().feedBlock` 同一条分工。未登记的 `rewardId` 抛 `RangeError`：
按钮是 `rewardState` 渲染出来的，传别的值只可能是代码写错。

### `data/rewards.js`：三条，四个字段

```js
export const REWARDS = [
  { id: 'snack', name: '零食一次', icon: '🍪', medalCost: 2 },
  { id: 'cartoon', name: '动画片1集', icon: '📺', medalCost: 3 },
  { id: 'money', name: '5元零花钱', icon: '💰', medalCost: 5 },
];
```

线上元素还有 `needsConfirm` 与 `enabled`，三条取值全相同（`true` / `true`）且
本轮的兑换流程里没有分支读它们 —— 是死字段，不转抄（与 `defaultHabits.js` 不转抄
`subCategory` / `module` 同一条）。奖励项的启用与改价要等 P7，届时 `REWARDS`
要么进存档要么加字段，那时再说。

### 十一条成就全登记，缺模块的进度恒 0

`data/achievements.js` 十一条原样转抄，元素 `{ id, name, icon, description, condition, threshold }`。
`condition` 是字符串，判据函数在 `utils/reward.js` 里按它分派（与 `health.js` 的
`FIELDS` 注册表同构）：

| id           | `condition`      | 判据（本仓库）                                        | 阈值 |
| ------------ | ---------------- | ----------------------------------------------------- | ---- |
| `early-bird` | `habit_wake`     | `wake` 的连续打卡天数                                 | 3    |
| `brush-7`    | `habit_brush`    | `brush-am` 的连续打卡天数                             | 7    |
| `read-5`     | `reading_days`   | `days[*].learning.reading` 存在的天数（累计）         | 5    |
| `char-50`    | `chars_learned`  | `learningProgress.literacy.chars` 的**键数**          | 50   |
| `poem-10`    | `poems_mastered` | `learningProgress.guoxue?.poems` 里已掌握的数         | 10   |
| `math-10`    | `math_games`     | `learningProgress.math?.rounds` 里 `correct` 为真的数 | 10   |
| `veggie-5`   | `veggie_week`    | 本周七天里 `checks.vegetables` 的天数                 | 5    |
| `tidy-5`     | `room_tidy`      | `checks.room` 的天数（累计，不限本周）                | 5    |
| `full-week`  | `full_week`      | 本周达标天数 ≥ 5 时为 `1`（与周奖励共用同一个函数）   | 1    |
| `pet-5`      | `pet_level`      | `pet.petLevel`                                        | 5    |
| `daily-3`    | `daily_all_done` | `days[*].bonuses.allDone` 为真的天数（累计）          | 3    |

`condition` 的十一个取值是**线上原样**（`habit_wake` 这种下划线命名与本仓库的
驼峰不一致，但它是常量表里的数据、不是标识符，改它等于给转抄留一处对不上的地方）。
`utils/reward.js` 的分派表按这十一个键注册判据函数，缺一个就抛 `RangeError` ——
常量表加了行却忘了写判据，要在测试里立刻炸掉，不能静默返回 0。

`poem-10` 与 `math-10` 依赖还没做的模块，本轮进度恒 `0`：读的是
`learningProgress.guoxue` / `math`，两个子键此刻不存在。**这不是不可达代码** ——
判据函数照样跑，只是返回 0；古诗与数学那两轮把子键加上，这两条自动亮起来，
不必回头改 `ACHV`。代价是奖励中心里有两行进度条长期停在 `0/10`。

**这个「自动亮起来」只对了一半 —— `math-10` 的判据字段名当时就写错了**（P5 数学那一轮
发现的）：本轮写的是 `learningProgress.math?.games`，而这个字段**线上叫 `gamesCompleted`、
本仓库叫 `rounds`**，`games` 两边都不存在。门禁抓不到它，因为「进度恒 `0`」既是
「子键还不存在」的正常表现、也是「字段名对不上」的表现，两者的观测结果一模一样。
`ACHV-06` 当时只断言了「缺模块时返回 0」，那条断言在字段名写错时照样通过。
数学那一轮把判据改成上表那行（数 `rounds` 里 `correct` 为真的题），
并给 `ACHV-06` 补一段「造几道答对的题、断言真的数出来了」——
**空进度的断言必须配一条非空进度的断言，否则钉住的只是「没炸」**（`MATH-36`）。
`poem-10` 逃过这一劫是运气：它读的 `poems` 恰好与古诗那一轮落的字段同名。

**`char-50` 数的是「学过」而不是「已掌握」，这是本轮第三处偏离线上。**
线上数 `masteredChars.length`，而线上一次「我认识」就永久掌握，所以那个数就是「点过的字数」。
本仓库的掌握要熬完六个间隔、跨 58 天（`docs/features/literacy/doc.md`），
若这条成就仍数已掌握，它在头两个月**结构性地不可能达成**，孩子看到的是永远 `0/50`。
`literacy/doc.md` 已经写明「学过 N 字是给孩子看的，已掌握 N 字是给家长看的」——
成就是给孩子的动机，所以数「学过」，`description` 相应写成「学过 50 个汉字」。

`early-bird` / `brush-7` 的连续天数沿用 `habitStreak` 的 30 天上限（同一条理由：
给读取路径一个 O(30) 的上界）。累计类的三条（`read-5` / `tidy-5` / `daily-3`）扫整个
`days`，不设上限 —— 一年 365 个键，且线上也是全扫。

### 成就解锁写流水，进度每次现算

**第四处偏离线上**：解锁给的那枚勋章**要进流水**（`解锁成就：早起小明星`）。
线上不写，于是「流水加起来等于余额」不成立。本仓库 `POINT` 区已经把
「流水是账、货币是余额」定成不变式（`POINT-10`），账上缺一笔比线上那点省略更贵。

进度**不存**，每次读取从存档现算 —— 所以 `medalProgress` 在
`docs/features/storage/doc.md` 里是**永久不接**的顶层键。这一条同时消掉了上文问题 4：
没有快照就不会有「停在解锁那一刻」的快照。代价是奖励中心每次进来要扫一遍 `days`。

**进度会回落，但已解锁不撤销。** `veggie-5` 与 `full-week` 是「本周」口径的，
下周一进度归零，而 `achievements` 只增不减（`SAVE-16` 已钉去重与只留字符串）。
线上同样。成就是「达成过」的记录，不是当前状态 —— 撤销会让「解锁」这件事没有意义。

一次结算可以解锁多条：逐条判、逐条发勋章、逐条写流水（线上也是循环里 `push`）。

### 一个结算入口：`settleDay`

三件事的顺序固定：

```js
settleDay(save, key, now) -> save   // 今日全勤 → 周奖励 → 成就解锁
```

**全勤必须在成就之前**：`daily-3` 数的是 `bonuses.allDone` 的天数，
若成就先跑，今天刚打满的这一天要等到下次结算才被数进去 —— 孩子会看到
「今天全勤了，但『累计 3 天全勤』的进度没动」。周奖励夹在中间，它与另外两件互不依赖，
但顺序仍然钉一条规格，免得下一个人按字母序重排。

什么都没发生时**原样返回入参**（对象同一性），页面 `if (next === this.save) return` 不落盘。

### `settleDay` 挂进 `checkAwardAndGrow`，不留给页面

`checkAwardAndGrow(save, key, habitId, now, gainedExp)` 内部调用 `settleDay`，
于是**每一次打卡都必然结算一次奖励**。四条打卡路径（自律、健康、学习表单、识字）
本来就全走它，所以这一处改动等于五个页面一起接上，且不变式由一个函数独占维护。

理由与 `POINT` 区「打卡与发放合成一个函数，不留给页面两步走」逐字相同：
留给页面两步走意味着页面可以只做一步，于是「打满七条就有勋章」没有任何东西保证它。
线上正是两步走 —— `Fr(e)`（成就）与 `Ar/Mr`（全勤 / 周奖励）在四个调用点各写一遍，
漏一处就是一类打卡不发勋章。

`checkAwardAndGrow` 的名字因此比它做的事窄了一点。不改名：它在四份 `doc.md`、
五个页面与一批测试里被引用，而「打卡之后该发生的全部事情」本来就是它存在的理由
（P4 加宠物经验时是同一次扩张）。

`settleDay` 仍然**导出**，因为还有两个调用点：奖励中心页的 `onShow`
（导入线上存档后第一次进来要能补发）、以及首页的 `onShow`（跨天后周奖励可能已达标）。
两处都靠对象同一性避免无谓落盘。

依赖方向：`pet.js → reward.js → point.js → habit.js → dayKey.js`，无环。
`reward.js` 不 import `pet.js`（`pet-5` 直接读 `save.pet.petLevel`），
所以那条链上没有回边。

### 货币变动的唯一入口

全勤、周奖励、成就解锁、兑换是四处新的货币变动，都要写流水。
`point.js` 原本的 `post` 是私有的，本轮把它导出成 `postLedger`：

```js
postLedger(save, key, type, amount, reason, now) -> save
```

导出一个「原始」函数看着比 `checkAndAward` 那种成对封装弱，但它换来一条更强的不变式：
**`save.currency` 只可能被 `point.js` 改**，而它每次改都追加一条流水。
四处新产出各自 `{ ...save, currency }` 才是真的危险 —— 那会让账与余额悄悄分叉。

### `utils/reward.js` 的五个函数

```js
rewardState(save, key, now)        -> { medal, gem, items, redemptions, allDone, coreDone, coreTotal, weekBonus }
achievementState(save, key, now)   -> [{ id, name, icon, description, progress, threshold, unlocked }]
redeem(save, key, rewardId, now)   -> save   // 勋章不够时原样返回
settleDay(save, key, now)          -> save   // 全勤 → 周奖励 → 成就
unlockAchievements(save, key, now) -> save   // settleDay 的第三步，单独导出便于测试
```

两个 `*State` 是页面唯一的读取入口，**都不抛错**（渲染宽容）：`achievements` 里有脏值、
`learningProgress` 缺子键、核心任务被删都只影响数值，不影响能不能打开页面。
`redeem` 严格（未登记 id 抛 `RangeError`），`settleDay` / `unlockAchievements` 的
`now` 非有限数抛 `TypeError`（`AGENTS.md` 第 5 节第 6 条）。

`rewardState` 里的 `weekBonus` 是 `{ days, minDays, done }` —— 本周达标天数、阈值、
这周发过没有；`allDone` 是布尔值，含义是「今天这枚全勤勋章发过了没有」（读的就是水位）。
`coreDone` / `coreTotal` 是顶部那句「今日 N/7 项全满」的两个数，分母跟着启用状态变，
所以页面不写 `7`。
`redemptions` 的元素在存档那六个字段之外多一个 `statusText`（`待家长兑现` / `已兑现`），
与 `items[].affordable`、`poopIcons[].current` 同一条分工：**页面不自己比、也不自己映射文案**，
否则「两处状态文案不一致」这种 bug 要等到 P7 加了第三个状态才暴露。

### 页面：奖励中心

| 区块     | 内容                                                                |
| -------- | ------------------------------------------------------------------- |
| 顶部     | `🏅 n` `💎 n`，下面一行「今日七项全满 +1🏅 · 本周达标 N/5 天 +1💎」 |
| 兑换     | 三张卡片：图标 + 名字 + `n🏅`，勋章不够时置灰                       |
| 兑换记录 | 最新在前，每条显示图标、名字、花了几枚、状态（待家长兑现 / 已兑现） |
| 成就     | 十一行：图标 + 名字 + 说明 + 进度条 `N/阈值`，已解锁的加一个 ✅     |

`wx.navigateTo` 从首页进来，不加第五个 tab（四个已经是 5 岁孩子能记住的上限，
而奖励中心是「攒够了才来看」的页面，不是每天必进的入口）。线上也是从首页跳。

首页货币带**从两种改成四种**：`⭐ 🍖 🏅 💎`。`pages/home/home.js` 里那句
「宝石与勋章打卡产不出，不显示恒为 0 的数字」的注释本轮作废 —— 两者现在都有产出。
首页同时加一个入口按钮进奖励中心。

成就解锁与全勤/周奖励的提示走 `wx.showToast`，一次只弹最要紧的一条（勋章 > 周奖励 > 成就），
不做弹窗与动画（线上有 `newMedal` 弹层，那要图片资源与动画层，与「零二进制资源」冲突）。

弹哪一条由**结算前后两份存档的水位差**决定（`bonuses.allDone`、`lastWeeklyBonusWeek`、
`achievements.length` 三处各比一次），不重新判一遍规则。差别在跨天与重复进入：
直接读 `rewardState().allDone` 会把「今天早些时候在首页发过的那枚全勤」
也说成本次刚发的，于是每次进奖励中心都恭喜一遍。这与页面「不做业务判断」不冲突 ——
比两个水位是适配层的事，判据仍然只在 `utils/` 里。

## 行为规格

### 兑换（`REWARD`）

| Spec ID   | 输入                                          | 期望输出                                                                                 |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| REWARD-01 | 空存档 `rewardState`                          | `items` 三条（`snack` / `cartoon` / `money`），`affordable` 全 `false`，`redemptions` 空 |
| REWARD-02 | `medal` 为 `3` 时 `rewardState`               | `snack` / `cartoon` 的 `affordable` 为 `true`，`money` 为 `false`                        |
| REWARD-03 | `redeem(save, key, 'snack', now)`             | `medal` -2，`redemptions` 多一条 `status: 'pending'` 且在数组最前                        |
| REWARD-04 | 同上                                          | 流水追加一条 `{ type: 'spend', medal: 2, reason: '兑换：零食一次' }`                     |
| REWARD-05 | 同上                                          | 记录里 `name` / `icon` / `medalCost` 是快照，不回查 `data/rewards.js`                    |
| REWARD-06 | 勋章为 `1` 时 `redeem(..., 'snack', ...)`     | 原样返回入参（对象同一性），不产生记录也不写流水                                         |
| REWARD-07 | `redeem` 传未登记的 `rewardId`                | 抛 `RangeError`                                                                          |
| REWARD-08 | `redeem` 的 `now` 非有限数                    | 抛 `TypeError`                                                                           |
| REWARD-09 | 连续兑换 `snack` 两次（勋章足够）             | 两条记录，最新在前；勋章共扣 4                                                           |
| REWARD-10 | `redeem` 后检查入参 `save`                    | 未被改动（返回的是新对象）                                                               |
| REWARD-11 | 打满七条核心项后 `settleDay`                  | 顺序是全勤 → 周奖励 → 成就：同一次调用里 `daily-3` 的进度已含今天                        |
| REWARD-12 | 无事可做时 `settleDay`                        | 原样返回入参（对象同一性）                                                               |
| REWARD-13 | 用 `checkAwardAndGrow` 打上第七条核心项       | 同一次调用里 `medal` 已 +1（结算挂在打卡入口里，页面不必再调）                           |
| REWARD-14 | `settleDay` 的 `now` 非有限数                 | 抛 `TypeError`                                                                           |
| REWARD-15 | 存档里 `redemptions` 有脏元素时 `rewardState` | 不抛错，脏元素按 `SAVE-15` 收敛后显示                                                    |

`REWARD-06` 与 `REWARD-07` 是一对刻意的不一致：勋章不够是**正常状态**（页面把按钮置灰），
传错 id 是**编程错误**。同一个函数两种错误策略，理由见 `AGENTS.md` 第 5 节第 6 条。

`REWARD-13` 断言的是 `pet.js` 的行为，声明在这里是因为「打卡就结算」这条规则属于本区 ——
`docs/features/pet/doc.md` 只在散文里指过来，不重复声明 ID。

### 成就（`ACHV`）

| Spec ID | 输入                                           | 期望输出                                                                       |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| ACHV-01 | 空存档 `achievementState`                      | 十一条，`unlocked` 全 `false`；`progress` 除 `pet-5` 为 `1` 外全 `0`           |
| ACHV-02 | 连续三天打上 `wake` 后 `unlockAchievements`    | `achievements` 含 `early-bird`，`medal` +1，流水 `解锁成就：早起小明星`        |
| ACHV-03 | 同上，再调一次 `unlockAchievements`            | 原样返回入参，不重复发放                                                       |
| ACHV-04 | 一次结算同时够两条成就                         | 两条都进 `achievements`，`medal` +2，流水两条                                  |
| ACHV-05 | `chars` 里有 50 个键（`step` 全为 `0`）        | `char-50` 进度为 `50` 并解锁（数「学过」，不要求已掌握）                       |
| ACHV-06 | `learningProgress` 缺 `guoxue` / `math` 子键   | `poem-10` / `math-10` 进度为 `0`，`achievementState` 不抛错                    |
| ACHV-07 | 本周七天里五天打上 `vegetables`                | `veggie-5` 进度为 `5` 并解锁                                                   |
| ACHV-08 | 跨两个月共五天打上 `room`                      | `tidy-5` 进度为 `5`（累计，不限本周）                                          |
| ACHV-09 | 本周达标五天                                   | `full-week` 进度为 `1`（与周奖励共用达标日判据）                               |
| ACHV-10 | `pet.petLevel` 为 `5`                          | `pet-5` 进度为 `5` 并解锁                                                      |
| ACHV-11 | 三天 `bonuses.allDone` 为真                    | `daily-3` 进度为 `3` 并解锁                                                    |
| ACHV-12 | `brush-am` 连续六天后断一天、又打两天          | `brush-7` 进度为 `2`（连续中断即归零），未解锁                                 |
| ACHV-13 | `veggie-5` 解锁后进入下一周                    | 进度回落但 `achievements` 里仍有它，`unlocked` 为 `true`                       |
| ACHV-14 | 存档里 `achievements` 为 `['a', 'a', 7, null]` | `achievementState` 不抛错，十一条的 `unlocked` 全 `false`（`'a'` 不是成就 id） |
| ACHV-15 | `unlockAchievements` 的 `now` 非有限数         | 抛 `TypeError`                                                                 |
| ACHV-16 | `unlockAchievements` 后检查入参 `save`         | 未被改动；无成就可解锁时返回入参本身                                           |

`ACHV-05` 是本轮偏离线上的一条：线上 `char-50` 数 `masteredChars`，本仓库数
`chars` 的键数。没有这条规格，下一个人「按线上抄回去」会让这条成就两个月内不可达。

`ACHV-09` 与 `POINT-30` 断言的是同一个判据的两个读取点。两条都在，是为了挡住
下一个人给成就单独写一套「达标」的算法（线上就是那样，两套口径给不同答案）。

`ACHV-13` 钉住「成就是达成过的记录，不是当前状态」。

`ACHV-01` 里 `pet-5` 的进度是 `1` 而不是 `0`：宠物等级的初始值就是 1 级
（`docs/features/storage/doc.md` 的 `pet.petLevel` 默认值），进度条一开始显示
`1/5` 是**对的** —— 空存档里那只小伙伴确实已经存在了。把它按到 0 需要给这一条
单独减 1，那就是「同一份数据两套口径」，正是本区在别处一直躲开的毛病。

### 本轮追加到 `POINT` 区的规格

今日全勤与周奖励的十二条（`POINT-20` ~ `POINT-31`）声明在
`docs/features/point/doc.md` —— 它们是**货币产出**，与打卡发放同区同模块（`utils/point.js`）。
本表不重复，与 P6 的 `weekKeys` 归 `DAY` 区、P5 识字的 `learningProgress` 归 `SAVE` 区
是同一条分工：**原语与货币产出归既有区，本区只声明 `REWARD-NN` / `ACHV-NN`。**

## 范围外

- **不做贴纸（`STICKER`）。** 140 张是一份与字库同量级的数据资产，还要给纯函数注入
  随机源、加一个收藏册页面 —— 够单独一轮。勋章此刻已经有兑换这个消耗口，
  动机链不缺它就闭不上。
- **不做家长审批与驳回。** 没有审批入口（家长端 P7），写 `approveExchange` /
  `rejectExchange` 就是不可达代码（`AGENTS.md` 第 5 节第 4 条）。
  申请即扣勋章的设计让本轮不需要它们，`status: 'done'` 的写入路径也留给 P7。
- **不做撤销兑换。** 同上，且「说出口就算数」对 5 岁孩子是更清楚的规则。
- **不做家长端改奖励项与阈值。** `REWARDS` 与 `ACHIEVEMENTS` 是常量，不进存档。
  线上的 `rewardRules` 因此**仍不导入**（`docs/features/storage/doc.md` 的「不接」名单）。
- **不做 `medalProgress` 的导入。** 永久不接：本仓库的进度每次现算，没有对应字段。
- **不做勋章有效期与过期清理。** 勋章只增不减（除兑换），不做「季末清零」这类惩罚性规则。
- **不做成就的弹层与动画。** 只有 `wx.showToast`。弹层要图片与动画层，
  与「零二进制资源」冲突。
- **不做兑换记录的分页与清理。** 一年最多几十条，不会涨到需要裁剪的量级
  （与流水同一条判断）。
- **不做古诗与数学的成就判据。** 两条的进度恒 `0`，各自那一轮把
  `learningProgress.guoxue` / `math` 加上就自动亮起来。
- **不做首页显示成就进度。** 首页仍是「问候语 + 进度 + 货币带 + 九个自律格子」，
  本轮只给它加一条进奖励中心的入口与两个新币种。
