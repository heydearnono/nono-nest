# 家长端第一段（PIN 长按入口 + 家长设置 + 数据搬迁）

- 区名：`PARENT`（家长端 PIN、设置、任务管理、规则、报告）
- 模块：`miniprogram/utils/parent.js`、`miniprogram/pages/parent/`
- 状态：**第一段已完成**（见 `summary.md`）。第二段（任务管理 + 兑换卡启用）与
  第三段（看板 + 每日报告 + 兑换审批）未开始，`PARENT` 区从 `PARENT-24` 续号
- 关联愿景：`docs/vision.md` P7（家长后台），**本轮只做第一段**
- 顺带产出：存档 `parent` 子键补两个 PIN 节流字段（`SAVE-19` / `IMPORT-16`）、
  首页多一个长按入口、**全仓第一个 `importOnlineSave` 调用点**

## 背景

P7 是 `docs/vision.md` 里最后一个「未开始」且非可选的阶段（P8 语音跟读要先申请
WechatSI 插件）。它同时压着全仓最大的一个缺口：`utils/importOnline.js` 从 P1 起
就能把线上 JSON 映射成本仓库存档（`IMPORT-01` ~ `IMPORT-15`，15 条规格全绿），
**但全仓零调用点** —— nono 线上已有的进度至今搬不过来。
`literacy/summary.md`、`poem/summary.md`、`math/summary.md` 三份连着三轮把它记成
「最大的一个缺口」，本轮就是来接上这根线的。

线上家长端有 5 个页面 + 一条数据条 + 一条待确认兑换条，一轮做完会是一张
50 条以上的规格表、跨多次上下文压缩。所以**拆三段**：

| 段  | 内容                                            | 本轮 |
| --- | ----------------------------------------------- | ---- |
| 一  | 长按入口 + PIN 验证 + 家长设置 + 导出/导入/清空 | 是   |
| 二  | 任务管理（增删改与启用）+ 兑换卡启用            | 否   |
| 三  | 看板 + 每日报告 + 兑换审批                      | 否   |

第一段这么切是因为**数据搬迁不能再等**：第二段要改的 `habits`、第三段要读的
`days`，都应该先是 nono 真实的那一份，而不是空存档。先有导入，后面两段才有真数据可看。

### 线上的家长端（逆向自 `index-VUOSJfWA.js`）

五条路由（`/parent` `/parent/tasks` `/parent/rules` `/parent/report` `/parent/settings`），
入口是首页头部那个 ⚙️：`onPointerDown` / `onTouchStart` 起一个 100ms 轮询的
`setInterval`，**按住满 3 秒**弹「家长验证」蒙层，输入 4 位数字与
`parentSettings.pin` 全等则 `navigate('/parent')`。

```js
parentSettings: { pin: `1234`, dailyGoal: 6, note: `` };  // 存档初值，三个字段
setParentPin: (n) => set(draft => { draft.parentSettings.pin = n; });
```

设置页（`EB`）四个输入：孩子昵称（`maxLength 12`，空则回落 `Nono`）、
PIN（`replace(/\D/g,'').slice(0,4)`）、每日目标（`Math.min(12, Math.max(1, …|| 6))`）、
家长备注（`textarea`，trim）。保存按钮一次写三处
（`updateProfile` / `setParentPin` / `updateParentSettings`）。

数据条（`xB`）三个按钮 + 一个音效开关：

```js
exportData: () => JSON.stringify(state, null, 2); // navigator.clipboard + alert
importData: async (t) => set({ ...JSON.parse(t) }); // prompt('粘贴 JSON')
resetData: async () => set({ ...defaultState() }); // confirm('确定清空所有数据？')
```

### 线上的已知缺陷

**六项**，本轮涉及前五项：

1. **长按 3 秒的定时器泄漏。** `setInterval` 每 100ms 跑一次，清理挂在
   `touchend` / `pointerup` 上；`touchcancel` 只在 `onTouchStart` 那条路径注册，
   `onPointerDown` 那条**没有**。指针事件被取消（滚动接管）时那个 interval 永远不清 ——
   手一直没抬起来的效果是「三秒后蒙层自己弹出来」。
2. **PIN 输错没有任何节流。** 4 位数字只有一万种组合，孩子拿着手机可以一直试。
   线上唯一的反馈是「密码不对哦，请再试一次」。
3. **改 PIN 有两个入口，一个不校验。** 设置页（`EB`）保存时有
   `/^\d{4}$/.test(s)` 守卫；规则页（`CB`）那个输入框**边打边写存档**，
   删到只剩一位就直接落盘 —— 此后 PIN 是 `'1'`，而验证蒙层的输入框
   `maxLength=4` 却要求恰好等于它，输一位能进。
4. **导入不校验、不确认、静默整份覆盖。** `JSON.parse` 抛错时
   `importData` 的 `await` 在 `onClick` 里没有 `catch`，粘错东西是一个
   unhandled rejection，界面上什么都不发生 —— 分不清「导入失败」与「导入了空数据」。
5. **清空数据只有一句 `confirm`。** 与「导入」「导出」三个按钮同样大小、挨在一起。
6. **`dailyGoal` 的两处上界不一致。** 设置页夹 `1~12`，而看板与报告用它当
   「完成几项算达标」的分母、不夹 —— 导入一份 `dailyGoal: 99` 的存档，
   看板永远显示「差 99 项」。（本轮在存档层夹掉，见下。）

## 设计

### 三处偏离线上

| 项   | 线上                           | 本仓库                                       |
| ---- | ------------------------------ | -------------------------------------------- |
| PIN  | 明文 4 位，输错无限次          | 明文 4 位，**输错 5 次冷却 60 秒**           |
| 导入 | `prompt` 粘贴，静默整份覆盖    | **粘贴框 + 二次确认弹窗**，失败给出具体原因  |
| 长按 | 3 秒，`setInterval` 100ms 轮询 | **1.5 秒**，`setTimeout` 一次；`touchend` 清 |

**PIN 仍存明文，「忘了」仍只能清空数据。** 这一条把 `docs/vision.md` 里挂了七个阶段的
`待确认` 拍成定论。理由不是省事：存档是本机 storage 的一条记录，
**能读到 storage 的人能读到里面任何东西**，哈希只防孩子、不防人，而孩子看不到 storage。
哈希的实际代价是设置页不能回显当前 PIN（线上回显）、改 PIN 要输两遍，
再加零依赖下自己写一个弱哈希 —— 收益接近于零。

**但补一条线上没有的节流：连错 5 次冷却 60 秒。** 威胁模型里那个真实的对手是
**5 岁的孩子拿着这台手机穷举**，而一万种组合里她会先试的是
`1111` / `1234` / 生日那几个。60 秒的冷却把「一直点」变成「点不动」，
而它对家长几乎无成本（自己的 PIN 不会连错五次）。存档因此多两个字段
（`pinFails` / `pinLockedUntil`，`SAVE-19`）—— 它们是**水位**，不是设置项，
所以落在 `parent` 子键里而不是新开顶层键。

**导入换成粘贴框 + 二次确认。** 整份覆盖是 `vision.md`「数据迁移」一节早就定的
（一次性动作、不做双向同步、不做合并），本轮不改这一条 —— 改的是它**问不问**：
一次误粘贴会把 nono 攒了几个月的进度换掉，而这个动作在线上只有一个
`prompt`。所以：粘贴框失焦后先解析、先给出「这份数据里有 X 天记录、Y 个字、
Z 首诗」的摘要，家长点「确认覆盖」才落盘。**摘要是唯一能在覆盖前区分
「粘对了」与「粘了别的」的东西** —— 光看 JSON 的前 80 个字符看不出来。

**长按从 3 秒缩到 1.5 秒，实现从轮询换成一次 `setTimeout`。** 3 秒是线上为了
「防孩子误触」定的，但真正防误触的是后面那道 PIN；1.5 秒少一半的等待，
而 5 岁的孩子按住一个不动的角标 1.5 秒本来就不常发生。轮询换成
`setTimeout` 顺带修掉缺陷 1：小程序里 `touchend` / `touchcancel` 都能绑，
两个都清同一个 timer id。

### `parent` 子键：三个设置 + 两个水位

```js
parent: {
  pin: '1234',        // 明文 4 位数字
  dailyGoal: 6,       // 每日完成几项算达标，1 ~ 12
  note: '',           // 家长备注，只在家长端显示
  pinFails: 0,        // 连续输错次数，验对即清零。0 ~ 5
  pinLockedUntil: 0,  // 冷却到期的毫秒时间戳，0 = 没在冷却
}
```

前三个字段 P1 就有（`parentSettings` 的三个字段原样映射），本轮**只加后两个**。
`dailyGoal` 顺带把上界从 `+∞` 收到 `12`（缺陷 6）：线上设置页就是这么夹的，
只是那道夹子在页面里、导入绕得过去。上界落到 `normalizeSave` 之后，
「看板永远差 99 项」这条路径消失。

`pinLockedUntil` 存**到期时刻**而不是「还剩几秒」：后者要有人每秒去减它，
而存档不该有心跳。`pinFails` 上界 5 是因为它只用来跟 `PIN_MAX_FAILS` 比 ——
存到 `999` 与存到 `5` 的行为一样，夹住只是不让脏存档把数字撑大。

**两个字段都不从线上来**（`IMPORT-16`）：线上没有节流，导入时落默认值
`0` / `0` —— 与 `pet.lastFedAt` 同一条（本仓库新加的字段，导入落默认值）。

### `utils/parent.js`：四个纯函数

```js
parentState(save, now); // 读取入口，不抛错
verifyPin(save, input, now); // 验 PIN，返回 { ok, save, reason }
saveSettings(save, patch); // 写设置（昵称 / PIN / 目标 / 备注）
exportJson(save); // 存档 -> 可粘贴的 JSON 字符串
```

`parentState` 给出：

```js
{
  childName: 'nono', childAvatar: '👧',
  pin: '1234', dailyGoal: 6, note: '',
  locked: false,        // 正在冷却
  lockedSeconds: 0,     // 还剩几秒（由 now 与 pinLockedUntil 现算）
  failsLeft: 5,         // 还能错几次
  summary: { days: 12, chars: 30, poems: 3, rounds: 8, star: 40, medal: 2 },
}
```

`summary` 是**给家长看的一句话「这台机器上有多少数据」**，也是导入前后的对照物。
它数的都是存档上一层就能数出来的东西（`days` 的键数、三个学习子键的条数、两种货币），
**不 import 任何 `data/`** —— 家长端不需要知道题库有 30 道题。

`verifyPin` 是本轮唯一一个**同时返回判定与新存档**的函数：

```js
verifyPin(save, '1234', now) -> { ok: true,  save: 清零后的存档, reason: null }
verifyPin(save, '9999', now) -> { ok: false, save: 加了一次失败的存档, reason: 'wrong' }
verifyPin(save, '9999', now) -> { ok: false, save: 入参本身, reason: 'locked' }   // 冷却中
```

**它必须返回新存档**：验错要计数、验对要清零，两件都是落盘动作。
返回 `{ ok, save, reason }` 而不是抛错，因为「输错密码」是**正常的用户状态**
（`AGENTS.md` 第 5 节第 6 条）—— 与 `learningBlock` 返回原因码、
`petState().feedBlock` 同一套约定。`reason` 三取值：
`null`（对了）/ `'wrong'`（错了）/ `'locked'`（在冷却里，这次输入根本没验）。

冷却中**不累加 `pinFails`**，也不延长冷却：那会让「冷却期间乱点」把 60 秒变成永久。

`exportJson` 用 `JSON.stringify(save, null, 2)`（与线上同一形状）。
它在 `utils/` 而不是页面里，是因为「导出的是哪一份」是业务决定：
导出的是**存档原文**，不是线上那 19 个顶层键的形状 ——
本仓库的导出只用于备份与调试，**不做反向迁移**（线上导不进来，
它读的是 `parentSettings` 那套字段名）。这一点写在「范围外」。

导入不在 `parent.js` 里：`importOnlineSave` 早就在 `utils/importOnline.js`，
本轮只是给它接上第一个调用点。**`parent.js` 不 import `importOnline.js`** ——
两者没有共同的判断，页面各调一个即可。

### 页面

两个页面：

| 页面                  | 内容                                               |
| --------------------- | -------------------------------------------------- |
| `pages/parent/parent` | PIN 验证蒙层 → 通过后是家长首页（设置 + 数据两段） |
| —                     | 第二、三段的任务管理 / 看板 / 报告不在本轮         |

**PIN 验证与家长首页是同一个页面的两个状态，不是两个页面。** 分成两页要在
「验过了」这件事上落一个状态（存档字段或全局变量），而它不该跨页面存活 ——
退出家长端再进来必须重新验。同页两状态时那个「验过了」只是页面实例的一个字段，
`onUnload` 自然消失。

**长按入口在首页的问候语上，不新开 ⚙️ 角标。** 线上那个 ⚙️ 是头部头像旁边的按钮，
本仓库首页没有头像行；再加一个只有家长会用的角标，是给孩子多一个可点的东西。
问候语已经在最上面、占一整行，`bindlongpress` 挂上去零成本。
小程序的 `bindlongpress` 默认 350ms 触发，**所以计时自己写**：
`touchstart` 起一个 1.5 秒的 `setTimeout`，`touchend` / `touchcancel` 清掉。

数据段三个动作，三种确认强度：

| 动作 | 确认                                                      |
| ---- | --------------------------------------------------------- |
| 导出 | 无（只读）。`wx.setClipboardData` 自带「已复制」提示      |
| 导入 | 粘贴框 → 解析 → **显示摘要的确认弹窗** → 落盘             |
| 清空 | `wx.showModal` 二次确认，确认文案是「清空」而不是「确定」 |

清空为什么留着：开发期要反复回到空存档看首次进入的样子，而没有它就只能删小程序。
它藏在 PIN 后面、在页面最下面、字是灰的 —— 与「导出」「导入」不同样式（缺陷 5）。

## 行为规格

### 家长端 PIN、设置与数据搬迁（`PARENT`）

| Spec ID   | 输入                                                      | 期望输出                                                                                      |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| PARENT-01 | 空存档 `parentState`                                      | `pin` 为 `'1234'`、`dailyGoal` 为 `6`、`note` 为空串、`locked` 为 `false`、`failsLeft` 为 `5` |
| PARENT-02 | 有 12 天记录、30 个字、3 首诗、8 道题的存档               | `summary` 为 `{ days: 12, chars: 30, poems: 3, rounds: 8, star, medal }`                      |
| PARENT-03 | `verifyPin(save, '1234', now)`（PIN 正确）                | `ok` 为 `true`、`reason` 为 `null`、返回的存档里 `pinFails` 为 `0`                            |
| PARENT-04 | `verifyPin(save, '9999', now)`（PIN 错误）                | `ok` 为 `false`、`reason` 为 `'wrong'`、存档里 `pinFails` 为 `1`、`pinLockedUntil` 仍是 `0`   |
| PARENT-05 | 连错第 5 次                                               | `pinFails` 为 `5`、`pinLockedUntil` 为 `now + 60000`                                          |
| PARENT-06 | 冷却期内再验（含正确的 PIN）                              | `ok` 为 `false`、`reason` 为 `'locked'`、**原样返回入参**（`pinFails` 不加）                  |
| PARENT-07 | 冷却到期后（`now > pinLockedUntil`）验正确的 PIN          | `ok` 为 `true`，`pinFails` 与 `pinLockedUntil` 都回 `0`                                       |
| PARENT-08 | 连错 4 次后验对                                           | `pinFails` 回 `0`（错误计数不跨越一次成功累加）                                               |
| PARENT-09 | `parentState` 在冷却期内                                  | `locked` 为 `true`、`lockedSeconds` 为剩余整秒（向上取整）、`failsLeft` 为 `0`                |
| PARENT-10 | `saveSettings(save, { childName: '糯糯', dailyGoal: 8 })` | 存档里两个字段都改了，`pin` / `note` 不动                                                     |
| PARENT-11 | `saveSettings(save, { childName: '   ' })`（全空白）      | `childName` 回落 `'nono'`（不落空串）                                                         |
| PARENT-12 | `saveSettings(save, { dailyGoal: 99 })`                   | 夹到 `12`；`0` 夹到 `1`                                                                       |
| PARENT-13 | `saveSettings(save, { pin: '12' })`（不是 4 位数字）      | 抛 `RangeError`（页面已按 4 位数字校验过，传进来只可能是编程错误）                            |
| PARENT-14 | `saveSettings(save, { pin: '4321' })`                     | `pin` 改了，且 `pinFails` / `pinLockedUntil` 都清零（改了密码就不该还在冷却里）               |
| PARENT-15 | `saveSettings(save, {})` / 传的值与现值全同               | **原样返回入参**（对象同一性），页面不落盘                                                    |
| PARENT-16 | `saveSettings` 传未登记的字段（如 `star`）                | 抛 `RangeError`（家长端不是万能写入口）                                                       |
| PARENT-17 | `exportJson(save)`                                        | 是 `JSON.parse` 之后与 `save` 深相等的字符串，且带缩进（含换行）                              |
| PARENT-18 | `exportJson` 的结果再 `normalizeSave`                     | 与原存档深相等（导出 → 导入 一个来回不掉字段）                                                |
| PARENT-19 | `verifyPin` 的 `now` 非有限数                             | 抛 `TypeError`                                                                                |
| PARENT-20 | `parentState` 的 `now` 非有限数                           | 抛 `TypeError`（它要现算冷却剩余秒数，`now` 是真的参数，与 `MATH-34` 不同）                   |
| PARENT-21 | 脏存档：`pinFails` 为 `-3` / `99`、`pinLockedUntil` 为负  | 读取时收敛（夹到 `0` ~ `5` 与非负），`parentState` 不抛错                                     |
| PARENT-22 | 脏存档：`dailyGoal` 为 `99`（导入来的）                   | `normalizeSave` 夹到 `12`（缺陷 6 在存档层修掉）                                              |
| PARENT-23 | `verifyPin(save, 1234, now)`（数字而非字符串）            | `ok` 为 `false`、`reason` 为 `'wrong'`，不抛错（输入来自输入框，什么都可能）                  |

### 本轮追加到存储层的规格

`parent.pinFails` / `pinLockedUntil` 的默认值与收敛（`SAVE-19`）、
`dailyGoal` 的上界、以及线上四字段的导入映射（`IMPORT-16`）声明在
`docs/features/storage/doc.md`，本表不重复 —— 与 `SAVE-18` / `IMPORT-15` 同一条分工：
**存档形状归 `SAVE` / `IMPORT` 区，家长域只声明 `PARENT-NN`。**

`PARENT-05` / `PARENT-06` 是本轮偏离线上最要紧的一对：线上输错无限次，
少了 `PARENT-06`（冷却期间不累加）那 60 秒会被乱点续成永久。

`PARENT-17` / `PARENT-18` 一起钉住导出：只有 `PARENT-17` 会被
「导出一个 `{}`」蒙过（它也能 `JSON.parse`），只有 `PARENT-18` 会被
「导出时丢了 `days`」蒙过。

## 范围外

- **不做任务管理。** 增删改 `habits` 与 `needsParentConfirm` 的写入路径
  （`habit/doc.md` 预告过）是第二段。本轮家长端不写 `habits`。
- **不做积分规则与兑换价格可改。** `REWARDS` 的 `medalCost` 保持常量：
  改价会让「同一张卡不同时期不同价」进入历史记录的比对逻辑，而
  `rewards.js` 头注释已经写明「记录里是快照」。启用/停用是第二段。
- **不做看板、每日报告、兑换审批。** 第三段。`redemptions` 里
  `status: 'pending'` 的记录本轮仍然只能看不能批（与 `REWARD` 区现状一致）。
- **不做宠物改名。** 它卡在 `choosePet` 会覆盖 `name`（`pet/doc.md` 记着），
  要先解掉那个才能给入口。
- **不做每日新字数 / 每周首数 / 每天题数可配。** 三份 `doc.md` 都把它列在范围外，
  本轮不动：它们是常量，进设置要先拍板「改小了已经学过的怎么办」。
- **不做已掌握重学 / 已会背重学。** 同上，是内容调度的事不是设置的事。
- **不做 PIN 哈希、不做 PIN 找回。** 明文 4 位，忘了只能清空数据 ——
  `docs/vision.md` 那条 `待确认` 本轮拍成定论（理由见上文）。
- **不做反向迁移。** `exportJson` 导出的是本仓库存档原文，**导不回线上**
  （线上读 `parentSettings` / `tasks` / `dailyRecords` 那套字段名）。
  它只用于备份与调试。写一个反向映射表要维护两份，而线上那份 PWA 不再演进。
- **不做导入的合并模式。** 整份覆盖，`vision.md`「数据迁移」一节已定。
- **不做家长端 tab。** tabBar 仍是四个（首页 / 学习 / 健康 / 宠物）——
  家长端藏在长按后面，出现在 tab 里就不叫藏了。
- **不做音效开关。** 线上数据条上有一个，而全仓至今零音频资源
  （`math/doc.md` 范围外同一条）。`soundEnabled` 字段在存档里躺着，本轮不给入口。
- **不做多孩子档位。** `vision.md`「明确不做」已定，存档是单例。
