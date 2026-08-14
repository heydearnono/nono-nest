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
