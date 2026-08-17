# 家长端第一段（PIN 长按入口 + 家长设置 + 数据搬迁）· 完成总结

- 完成日期：2026-08-14
- 实际改动：`miniprogram/utils/parent.js`（新增）、`miniprogram/pages/parent/`（四个文件）、
  `miniprogram/utils/save.js`（`parent` 补两个水位字段、`dailyGoal` 上界、两个新常量）、
  `miniprogram/utils/importOnline.js`（**映射表一行没加**，只在头注释里写明两个新字段不接）、
  `miniprogram/pages/home/home.js` / `home.wxml`（问候语长按入口）、
  `miniprogram/app.json`（一个 page，不加第五个 tab）、`tests/parent.test.js`（新增）、
  `tests/save.test.js`（`SAVE-19`）、`tests/importOnline.test.js`（`IMPORT-16` 与 `IMPORT-01`
  的期望值）、`docs/glossary.md`（新增「家长端」一节）、`docs/vision.md`（PIN 那条
  `待确认` 拍成定论）、`docs/features/storage/doc.md`
- 规格：`PARENT-01` ~ `23`，加存储层的 `SAVE-19` / `IMPORT-16`（25 条）
- 门禁：`npm run check` 全绿（12 份 doc.md，328 条规格，14 个测试文件 / 342 个测试）
- **全仓第一个 `importOnlineSave` 调用点 —— 连着三轮 summary 记的「最大的一个缺口」封了**

## 实现要点

**`importOnlineSave` 有调用点了，而它一行没改。** P1 写下的 15 条导入规格从那时起
全绿而零调用点：映射对不对没人验过，因为没人调过。本轮只是在
`pages/parent/parent.js` 里接上一根线，`importOnline.js` 的改动仅限头注释与
`PARENT_MAP` 里一行「pinFails / pinLockedUntil 刻意不列」的说明。
**「写好了但没人用」是门禁抓不到的一类缺口** —— 规格全绿、覆盖率满、行为不存在。

**存储层先行第六次生效。** `parent.js` 只需要一个常数代价的 `parentOf` 再夹一次，
因为 `normalizeSave` 已经把五个 `parent` 字段收敛好了。这一轮尤其明显：
`verifyPin` 通篇不做「万一 `pinFails` 是 `-3`」的分支，那件事在读的时候就没了。

**缺陷 6 从页面挪进了存档。** `dailyGoal` 的上界 `12` 现在是 `normalizeSave` 里的
`DAILY_GOAL_MAX`，不再只是设置页的一句 `Math.min`。线上那道夹子在页面里，
导入一份 `dailyGoal: 99` 的存档绕得过去，看板会永远显示「差 99 项」——
上界落到存档层之后**那条路径不存在了**，与谁写的存档无关（`SAVE-19` / `IMPORT-16` /
`PARENT-22` 三处各钉一次）。

**缺陷 3 是结构性关掉的，不是加守卫。** 全仓只有 `saveSettings` 一个写设置的入口，
非 4 位数字的 `pin` 抛 `RangeError`；页面的 `onInputField` **只往 `form` 里收值**，
一次按键到不了存档。线上是两个入口——设置页那个校验、规则页那个边打边写，
删到只剩一位就落盘，此后 PIN 是 `'1'`。少一个入口比多一道校验可靠。

**冷却存到期时刻，不存剩余秒数。** `pinLockedUntil` 是毫秒时间戳，
「还剩几秒」由 `parentState(save, now)` 现算 —— 存剩余秒数就要有人每秒去减它，
而存档不该有心跳。页面那个 `setInterval` 每秒做的事是**重新问一次** utils，
不是自己减一。`lockedSeconds` 向上取整：还剩 0.2 秒时显示「1 秒」，
显示 0 秒却还点不动比多等一秒更让人困惑。

**`verifyPin` 是本轮唯一同时给判定与新存档的函数。** 验错要计数、验对要清零，
两件都是落盘动作，所以返回 `{ ok, save, reason }`。返回原因码而不是抛错，
因为「输错密码」是正常的用户状态（`AGENTS.md` 第 5 节第 6 条）——
与 `learningBlock` 的 `'done' | 'noTitle' | null`、`petState().feedBlock` 同一套约定。

**冷却中那一支原样返回入参。** `PARENT-06` 断言 `wrong.save === locked` 与
`right.save === locked` 两个对象同一性，然后在冷却里点十下，断言
`pinLockedUntil` 仍是 `NOW + 60000`、`pinFails` 仍是 `5`。少了这一条，
乱点能把 60 秒续成永久 —— 这是「加节流」这个动作自带的新缺陷，线上没有它是因为
线上根本没有节流。

**冷却到期后第一次输错从 1 数起，但清零发生在写路径。** `pinLockedUntil > 0` 时
上一轮的 `pinFails` 已经在到期那刻失去意义，可 `parentState` **不能**顺手把它清掉：
读取路径不该有副作用。所以那个 `? 0 :` 写在 `verifyPin` 里。

**导入的两种失败给两句不同的话。** `JSON.parse` 失败说「这段文字不是 JSON」并带上
`err.message`；`importOnlineSave` 抛 `TypeError` 说「这份 JSON 不像线上存档」。
两个 `try` 是分开的，任何一支都不落盘。线上那个 `await` 在 `onClick` 里没有 `catch`，
粘错东西是一个 unhandled rejection，界面上什么都不发生 —— 分不清「导入失败」
与「导入了一份空数据」。

**摘要是覆盖前唯一的对照物。** `parentState(...).summary` 数的是
`days` 的键数、三个学习子键的条数、两种货币，全都在存档上一层数得出来，
**不 import 任何 `data/`** —— 家长端不需要知道题库有 30 道题。同一个 `summary` 兼了两职：
家长首页显示「这台机器上有多少数据」，导入确认弹窗显示「这份数据里有多少」，
两个数字并排就能看出粘对了没有。光看 JSON 的前 80 个字符看不出来。

**粘贴框一改就把预览作废。** `onInputPaste` 同时把 `pending` 与 `preview` 置 `null`，
所以「粘 A → 解析 → 换成 B → 点确认」不会覆盖成 A。这不是线上的缺陷，
是**二次确认这个新增设计自带的新缺陷** —— 预览与落盘之间多了一段时间，
那段时间里输入可以变。

**长按换成一次 `setTimeout`，缺陷 1 顺带没了。** 线上是 100ms 的 `setInterval`，
清理只挂在一半的抬手路径上（`onPointerDown` 那条没注册 `touchcancel`），
滚动接管时那个 interval 永远不清，效果是「三秒后蒙层自己弹出来」。
本轮一个 timer id，`touchend` / `touchcancel` / `onHide` / `onUnload` 四处都清同一个。
`onHide` 那一处是自己找出来的：切后台时手上那一下不算长按，否则回到前台会莫名跳进家长端。

**长按挂在问候语上，不新开 ⚙️ 角标。** 本仓库首页没有头像行，
再加一个只有家长会用的角标是给孩子多一个可点的东西。`bindlongpress` 默认 350ms
太短，所以计时自己写。3 秒缩到 1.5 秒：3 秒是线上为了防误触定的，
但真正防误触的是后面那道 PIN。

## 与 `doc.md` 的偏差

**没有设计上的偏差。** 三处偏离线上（PIN 冷却、导入二次确认、长按 1.5 秒一次性 timer）
与 23 条规格全部照 `doc.md` 落地，四个纯函数的签名与返回形状一字未改。

**一处文档订正。** `storage/doc.md` 里 `rewardRules`「仍不接」那段的措辞与本轮的
拍板对不上（它写着「等 P7 家长端决定要不要接」），改成「P7 第一段拍板**不做改价**，
只有启用/停用进第二段，所以这一个可能永久不接」。

**`parent.js` 实际只 import 了 `save.js`。** `tasks.md` 的头注写的是
「只 import `dayKey.js` 与 `save.js`」，写完发现 `dayKey` 一次也用不上：
`summary` 数的是键数、冷却比的是毫秒时间戳，没有一处需要日期键。
少一条依赖不需要改文档以外的东西，但头注释里记了一句。

## PIN 那条 `待确认` 挂了七个阶段，本轮拍成定论

`docs/vision.md` 从 P0 起就挂着「家长 PIN 怎么存」这条 `待确认`。结论是
**明文 4 位，忘了只能清空数据**，与线上一致。理由不是省事：
**能读到 storage 的人能读到里面任何东西**，哈希只防孩子，而孩子看不到 storage。
哈希的实际代价是设置页不能回显当前 PIN（线上回显）、改 PIN 要输两遍，
再加零依赖下自己写一个弱哈希 —— 收益接近于零。

**但补了线上没有的节流。** 威胁模型里那个真实的对手是 5 岁孩子拿着这台手机穷举，
而一万种组合里她会先试 `1111` / `1234` / 生日那几个。60 秒的冷却把「一直点」
变成「点不动」，对家长几乎无成本。存档因此多两个字段，它们是**水位不是设置项**：
`verifyPin` 累加与清零，家长端没有输入框能改它们，导入时落 `0` / `0`
（与 `pet.lastFedAt` 同一条：本仓库新加的概念，线上没有，导入不猜）。

## 页面的三处约定

**蒙层与家长首页是同一页的两个状态。** 分成两页就要在「验过了」这件事上落一个状态
（存档字段或全局变量），而它不该跨页面存活 —— 退出家长端再进来必须重新验。
同页两状态时那个 `unlocked` 只是页面实例的一个字段，`onUnload` 自然消失。

**三个数据动作，三种确认强度。** 导出无确认（只读）；导入要粘贴 → 预览摘要 → 弹窗；
清空是 `wx.showModal`，确认文案是「清空」而不是「确定」。清空那个控件是
一个灰色的 `<view>` 而不是 `<button>`，在页面最下面 —— 线上三个按钮同样大小挨在一起
（缺陷 5）。清空之后回到 `unlocked: false`：PIN 已经变回默认值，
留在已解锁状态里说不通。

**倒计时只在冷却时开。** `render()` 里 `state.locked` 决定起停，
`onHide` / `onUnload` 都停 —— 与首页那个长按 timer 同一条纪律。

## 对第二三段的影响

- **数据搬迁不再是阻塞项。** 第二段要改的 `habits`、第三段要读的 `days`，
  从现在起可以是 nono 真实的那一份而不是空存档。这是第一段这么切的全部理由。
- **第二段（任务管理 + 兑换卡启用）的写入口要照 `saveSettings` 的形状。**
  白名单 + `RangeError` + 无变化返回入参这三条是本轮定下的家长端写入约定，
  改 `habits` 那个函数（大概叫 `saveHabit` / `removeHabit`）应当同形，
  而不是再造一个「万能 patch」。
- **第二段不做改价，只做启用/停用**，所以 `importOnline.js` 的 `rewardRules`
  很可能永久不接 —— 已经写进 `storage/doc.md`。
- **第三段的看板可以直接用 `dailyGoal` 当分母，不必再夹一次。** 上界在存档层，
  `99` 进不来。
- **`summary` 那六个数字是看板的雏形但不是看板。** 它数的是「有多少」，
  第三段要的是「这一周达标了几天」—— 后者要读 `days` 里每天的完成项数，
  与 `dailyGoal` 比。别把 `summary` 撑成看板，两者的问题不同。
- **`PARENT` 区已用到 `23`，第二段从 `PARENT-24` 起。**
- **兑换审批仍然只能看不能批**（与 `REWARD` 区现状一致），第三段的活。
- **不做的仍然不做。** PIN 哈希与找回、反向迁移（导回线上）、导入的合并模式、
  家长端 tab、音效开关、多孩子档位、宠物改名、每日新字数 / 每周首数 / 每天题数可配、
  已掌握重学。

---

# 家长端第二段（任务管理 + 兑换卡启用）· 完成总结

- 完成日期：2026-08-14
- 实际改动：`miniprogram/utils/parentTasks.js`（新增，448 行 / 五个导出函数）、
  `miniprogram/utils/save.js`（`habits` 的元素收敛 `habitEntry`、顶层键 `rewardFlags`、
  三个新常量）、`miniprogram/utils/importOnline.js`（`tasks` 从整份透传改成逐元素映射）、
  `miniprogram/utils/reward.js`（`rewardState` 过滤停用、`redeem` 停用返回入参）、
  `miniprogram/pages/parent/`（三个文件，页面从 286 行长到 497 行）、
  `tests/parentTasks.test.js`（新增，31 个测试）、`tests/reward.test.js`（`REWARD-16` / `17`）、
  `tests/save.test.js`（`SAVE-20` ~ `23`）、`tests/importOnline.test.js`（`IMPORT-17` / `18`
  与 `IMPORT-01` 的元素级断言）、`docs/glossary.md`、`docs/features/habit/doc.md`、
  `docs/features/reward/doc.md`、`docs/features/storage/doc.md`
- 规格：`PARENT-24` ~ `53`，加 `SAVE-20` ~ `23` / `IMPORT-17` / `18` / `REWARD-16` / `17`（36 条）
- 门禁：`npm run check` 全绿（12 份 doc.md，366 条规格，15 个测试文件 / 381 个测试）
- **家长端从「只能看」变成「能改」—— 第一段 summary 记的「全仓最大的缺口」封了一半**
  （另一半是 `redemptions` 的审批，第三段）

## 实现要点

**存储层这一轮不是「顺带产出」而是前置条件。** 前六轮的存储层改动都是先写 utils
再回头补收敛；这一次顺序反过来：`habits` 的元素收敛不做完，家长端改的就是一个
本仓库认不出的数组，而导入来的存档「合法但不生效」。所以 `save.js` 的
`habitEntry` 与 `importOnline.js` 的逐元素映射先落地，`parentTasks.js` 才开始写。

**`habits` 从本轮起收敛，而改的时点是「它第一次有了写入路径」。**
`storage/doc.md` 原来写着「`habits` 的元素由 `HABIT` 区定义，本层认不出好坏」——
那句话在家长端能写它之后不再成立：元素字段就是几个数、几个字符串、两个布尔，
和 `redemptions` 一样认得出好坏。**结构从 P2 起一个字没变，变的是有没有人写它。**
`days` 至今仍透传，因为它的内部结构真的由各 feature 定义。

**两个条件字段不补默认值。** `module` 只在 `learning` 上有意义、`weeklyTarget`
只在 `weekly` 上有意义。无条件补会让 18 条里 13 条多一个 `module: ''`，
而 `habitOf` 用 `find(item => item.module === module)` 找任务 ——
一堆空串会在有人传空串时匹配到第一条。**条件字段不补，是为了让缺席保持缺席。**

**`enabled` 的坏值落 `true`，与 `status` 落 `'pending'` 是同一种考量的相反方向。**
不明不白地少一个打卡项比多一个更难发现：首页少一格没人注意，
但分母跟着变，`dayProgress` 显示的「今天 5/8」是错的却看不出错。

**「读排列 / 写重排」是本轮新划的一条线。** `ordered()` 只按
`habit` → `learning` → `health` 排列，**一个 `sortOrder` 的值都不改** ——
读取入口给页面的必须是存档里那个数字。`reindex()` 才把整段重排成全局 `1..N`，
只在 `addHabit` / `moveHabit` 两个写路径用。两个函数一个不到十行，
分开写是因为「读的时候顺手把编号修好」会让 `parentTasks` 变成有副作用的读函数 ——
与第一段 `parentState` 不清 `pinFails` 是同一条纪律的第二次出现。

**整段重排而不是交换两个值。** 交换只在「当前值本来就连续无重复」时正确，
而线上 `addTask` 用 `tasks.length + 1` 当序号、删过任务之后必然与既有的撞（缺陷 8），
导入来的存档里就可能有重复值。重排让「值是否连续」不再是前提：
`PARENT-48` 造一份三条 `sortOrder: 1` 的脏存档，一次 `moveHabit` 出来就是 `1..5`。

**没有 `removeHabit`，而这不是「以后再做」。** 历史打卡按 id 存在
`days[键].checks[id]` 里，任务定义一删，`findHabit` 就对那些 id 抛 `RangeError` ——
`uncheckAndRefund` 与 `health.js::settle` 都先 `findHabit`，硬删一条今天打过卡的任务，
孩子点取消打卡会**抛错**。停用走 `saveHabit(save, id, { enabled: false })`，
不单开函数：`enabled` 本来就是四组可改字段里的一个。代价只是数组不会变短。

**`PARENT-30` / `PARENT-31` 是一对，钉的是两件事。** 停用改的是「首页显示不显示」
（`listHabits`）**与**「全勤分母」（`listCore` 同时看 `core` 与 `enabled`），
而改 `core` 只动后者。少了 `PARENT-31`，一个只过滤 `enabled` 的 `listCore` 也能全绿。

**三种不同的「不能改」，三条规格各挡一个方向。** 字段本身不可改（六个，`PARENT-34`）、
字段要走另一个入口（`sortOrder`，`PARENT-35`，错误信息里点名 `moveHabit`）、
字段这一类不可改（`learning` / `health` 的 `name` / `icon`，`PARENT-36`）。
一个只查白名单的实现能过第一条但过不了后两条。

**同一个字段两种策略，故意不一致。** `saveHabit` 的空名字回落 `'未命名'`（`PARENT-33`），
`addHabit` 的空名字抛 `RangeError`（`PARENT-43`）。前者是「家长清空了输入框又保存」，
后者是提交路径、名字是必填项。这一对与 `normalizeSave` 收敛 / `importOnlineSave` 抛错
同构：**同一份数据，读路径收敛、写路径严格。**

**`coreWarn` 是原因码不是布尔。** 取值 `null` / `'none'` / `'few'`，页面按它选一句话 ——
因为那个 `5` 是 `WEEKLY_BONUS.minDays`，属于 `POINT` 区。它是**提示不是门禁**：
`awardAllDone` 的 `core.length === 0` 那一支 P3-b 就写好了（`POINT-26`），
所以本轮**不加新的 `POINT` 规格**，也不拦住「最后一条 core 也被关掉」——
拦住它等于给家长一个「这项不能关」的错误，而她想关的可能正是那一项。

**`coreCount` 复用 `listCore`，不在本层重写口径。** `listCore({ habits: list })` ——
分母的定义（`core && enabled`）只有一处，家长端看到的数与首页、周奖励看到的一定同源。

**`rewardFlags` 只存开关，不把三条卡整份搬进存档。** 卡整份进存档，
`medalCost` 就跟着可写，而改价会让「同一张卡不同时期不同价」进入历史记录的比对
（`rewards.js` 头注释写着「记录里是快照」）。**只存开关，`medalCost` 想改也没地方改** ——
用结构关掉一个决定，比在文档里写「暫不支持」可靠。

**缺键 = 启用，所以读取侧一律判 `!== false`。** 写成「缺键 = 停用」会让存档里
还没有 `rewardFlags` 的老存档一张卡都换不了。这一条在三处各写了一遍注释
（`save.js` 头、`reward.js::isRewardEnabled`、`parentTasks`），
因为它是那种**看一眼像多余的判断、改成判真值当场全错**的代码。

**未知 id 原样留着，忽略它的是读取路径。** `normalizeSave` 零 import、
认不出哪个 id 在 `data/rewards.js` 里登记过，所以收敛只做「值收敛成布尔」。
这与 `days` 的透传同一条：本层不认得的键不删（删了就丢数据），只是没人读。

**兑换的守卫两处，与线上一致。** 只过滤列表，`redeem` 就成了一个「谁调都能扣勋章」
的函数；只守 `redeem`，停用的卡还留在列表里，点了给一句「暂时不可用」——
对 5 岁的孩子是「为什么给我看又不让我换」。`redeem` 的停用分支**返回入参本身**
而不是抛错：停用是家长刚在另一个页面按下的开关，页面那侧的列表可能还是上一次
渲染的，那是竞态不是编程错误。

**`toggleReward` 落在 `parentTasks.js` 而不是 `reward.js`。** 写入是家长域的动作，
`reward.js` 那一侧只加读取时的守卫。**同一个字段的读与写可以分在两个模块**，
判据是「这个动作属于谁」，不是「这个字段定义在哪」。

**`core` 从线上导入时落 `false`，理由不是「线上没有就不猜」。** 线上的全勤名单是
utils 里一个平行数组（八条含 `bath`），不在任务元素上。按 id 猜要在
`importOnline.js` 里写一份对照表，而**那份对照表会与 `defaultHabits.js` 的 `core`
字段构成第二个名单** —— P3-b 明确把名单从平行数组搬到任务字段上，
在 importer 里再写一份等于把那个被拆掉的东西原地重建。
代价是导入后要手动勾七下，处置是导入成功那个弹窗把这件事说出来。

## 与 `doc.md` 的偏差

**一处依赖偏差（与第一段同型）。** `tasks.md` 的头注写的是
「`parentTasks.js` import `save.js`（拿 `clampInt` 那几个夹子的同款常量）」，
实际 import 的是 `./point.js`（`listCore` 与 `WEEKLY_BONUS.minDays`）与
`../data/rewards.js`，`save.js` 一次也没用上：`save.js` 的 `HABIT_REWARD_MAX`
是模块私有的、没有导出，而本模块真正需要的是**分母的口径**与**那个 `5`**。
产出上下界因此是本模块的两个字面量（`REWARD_MIN` / `REWARD_MAX`），
注释里写明「与 `save.js` 的 `HABIT_REWARD_MAX` 是同一个 10：那边夹存档，这边夹输入」。
**两处 10 是刻意的**：把它导出成共享常量会让存档层与家长域耦合在一个数字上，
而它们夹的是两种不同来源的脏值（导入的脏存档 / 家长的输入框）。

**一处实现细节 `doc.md` 没写，写的时候差点写错。** `moveHabit` 换位之后
**要先把组内的 `sortOrder` 按新位置写一遍**再交给 `reindex`：

```js
const relabeled = moved.map((item, index) => ({ ...item, sortOrder: index + 1 }));
```

少这一行，`reindex` 内部的 `ordered` 会按旧的 `sortOrder` 把刚换的位置排回去 ——
函数变成一个静默的 no-op，而三十一个测试里只有 `PARENT-46` / `48` / `49` 会红。
这是「排列与重排分成两个函数」这个设计自带的接缝：`reindex` 的输入是**数组次序无关**的
（它自己排），所以调用方不能只改数组次序。写完在跑测试之前想到的，没有真的红过。

**没有设计上的偏差。** 四处偏离线上（软删除、只能加 `habit` 类、整段重排、只启用停用）
与 30 条规格全部照 `doc.md` 落地，五个函数的签名与返回形状一字未改。

**两处文档订正。** `reward/doc.md` 写着「`enabled` 是死字段」（本轮之后它活了，
只有 `needsConfirm` 仍是死字段），`data/rewards.js` 的头注释同一处也订正了；
`habit/doc.md` 里 `needsParentConfirm` 的注释从「P7 才读」改成「全仓零读取点」——
它的读取路径推到第三段（兑换审批那一轮要不要连任务也审）。

## 页面：三段留在一页，代价与拆点都写下来

**任务段是第三个 section，不新开 `pages/parent/tasks`。** 线上是一条独立路由，
本仓库不跟 —— 新开一页就要回答「跳过去要不要再验一次 PIN」：再验很烦，
不再验就得造一个跨页面的「验过了」，而那正是第一段明确拒绝的东西。
三段切换只多一个 `tab` 字段。**代价是 `parent.js` 成了全仓最大的页面（497 行）。**
拆点已经定了：第三段的看板进来时拆**看板**，因为它是只读的，
做成「从家长首页跳过去、进去前再验一次」不别扭（一天看一次，多输四个数字可以接受）。

**五个写函数的第三条约定在页面里封成一个 `commit`。** 六个写入口
（两个开关、上移下移、编辑保存、新增、兑换卡）全都走它：

```js
commit(next, done = '') {
  if (next === this.save) return false;
  this.save = getApp().writeSave(next);
  this.render();
  if (done !== '') wx.showToast({ title: done, icon: 'none', duration: 1200 });
  return true;
}
```

返回布尔而不是 void，只为了 `onTapSaveHabit` 那一处要区分「保存好了」与「没有改动」。
**六处各写一遍 `if (next === this.save) return` 会漏一处，而漏了的那处会静默多写一次盘。**

**产出值改了用弹窗，只改名字用 toast。** 「改动从下一次打卡生效，今天已打的卡
取消时按新值退」是范围外那条（不做按老值退）的兑现，但它每次编辑都弹就是噪音 ——
所以先比 `patch.starReward !== habit.starReward`，只有产出真的动了才弹。

**导入成功从 toast 换成弹窗。** 因为 `IMPORT-17` 让导入来的任务 `core` 全落 `false`，
一句「导入好啦」之后家长会以为全勤坏了。现在那个弹窗说
「任务的全勤名单需要在任务段确认」—— **同一轮里造成的后果，在同一轮里说出来。**

**页面一个 `category` 都不判。** `editable` / `first` / `last` / `coreWarn` 全由 utils 给，
页面只有 `CORE_WARN_TEXT[tasks.coreWarn] ?? ''` 这一张查找表。
那个 `5` 一次都没出现在页面代码里。

**停用的任务灰掉加删除线但仍然列着**，`coreWarn` 用黄底不是红底（它是提示不是错误），
新增表单下面写着「加错了可以停用 —— 任务不能删（历史打卡按 id 存）」。
**软删除这个决定要在界面上被解释一次**，否则家长会去找那个不存在的删除按钮。

## 对第三段的影响

- **`redemptions` 的审批是现在全仓最大的缺口。** 家长端能改任务与兑换卡了，
  但 `status: 'pending'` 的记录仍然只能看不能批 —— 第三段的活。
- **看板要读 `days`，那时才接导入的 `dailyRecords` 内部结构。** 本轮之后
  「导入来的任务定义生效了（能打卡、能发星光、能进全勤），历史打卡记录仍是原样
  透传的线上形状」—— 这是本轮范围外新加的一条，第三段必须处理
  （墓碑算不算打过卡、ISO 转毫秒、`learning` / `health` / `ledger` 三个兄弟键）。
- **`needsParentConfirm` 的入口等第三段。** 它现在全仓零读取点，
  给一个改了不生效的开关比不给更糟。审批那一轮如果要连任务也审，那时才给。
- **`parent.js` 到 497 行，第三段必须拆看板。** 不是「可以拆」，是拆点已经定好了。
- **`PARENT` 区已用到 `53`，第三段从 `PARENT-54` 起。**
- **`importOnline.js` 的 `rewardRules` / `pointRules` 永久不接。** 本轮把理由钉死了：
  费率在任务自己身上（`starReward` / `petFoodReward`），全局费率表没有位置；
  三条卡的启用映射恒等于默认值，没有信息量。三个「不接」的理由各不相同
  （`storage/doc.md` 里写成了一节）。
- **改价仍然不做**，`REWARDS` 的 `medalCost` 保持常量，而现在它是**结构上改不了**
  （存档里只有布尔）而不是「暂不支持」。
- **不做的仍然不做。** 删除任务、新增 `learning` / `health` 类、改
  `id` / `category` / `frequency` / `module` / `weeklyTarget`、按老值退、
  积分规则页、宠物改名、每日新字数可配、已掌握重学、PIN 哈希与找回。
