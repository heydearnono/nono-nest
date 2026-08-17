# 家长端（PIN 入口 · 设置 · 数据搬迁 · 任务管理）

- 区名：`PARENT`（家长端 PIN、设置、任务管理、规则、报告）
- 模块：`miniprogram/utils/parent.js`、`miniprogram/utils/parentTasks.js`、
  `miniprogram/pages/parent/`
- 状态：**第一段已完成**（`PARENT-01` ~ `23`，见 `summary.md`）；
  **第二段（任务管理 + 兑换卡启用）是本轮**（`PARENT-24` ~ `53`）；
  第三段（看板 + 每日报告 + 兑换审批）未开始，从 `PARENT-54` 续号
- 关联愿景：`docs/vision.md` P7（家长后台）
- 顺带产出：第一段补了 `parent` 的两个 PIN 节流字段（`SAVE-19` / `IMPORT-16`）、
  首页的长按入口、**全仓第一个 `importOnlineSave` 调用点**；
  第二段给 `habits` 补元素收敛与线上字段映射（`SAVE-20` ~ `22` / `IMPORT-17`），
  让导入来的任务**真的生效**，新开一个顶层键 `rewardFlags`（`SAVE-23` / `IMPORT-18`），
  并给 `REWARD` 区补两条启用守卫的规格（`REWARD-16` / `REWARD-17`）

## 背景

P7 是 `docs/vision.md` 里最后一个「未开始」且非可选的阶段（P8 语音跟读要先申请
WechatSI 插件）。它同时压着全仓最大的一个缺口：`utils/importOnline.js` 从 P1 起
就能把线上 JSON 映射成本仓库存档（`IMPORT-01` ~ `IMPORT-15`，15 条规格全绿），
**但全仓零调用点** —— nono 线上已有的进度至今搬不过来。
`literacy/summary.md`、`poem/summary.md`、`math/summary.md` 三份连着三轮把它记成
「最大的一个缺口」，本轮就是来接上这根线的。

线上家长端有 5 个页面 + 一条数据条 + 一条待确认兑换条，一轮做完会是一张
50 条以上的规格表、跨多次上下文压缩。所以**拆三段**：

| 段  | 内容                                            | 本轮   |
| --- | ----------------------------------------------- | ------ |
| 一  | 长按入口 + PIN 验证 + 家长设置 + 导出/导入/清空 | 已完成 |
| 二  | 任务管理（增删改与启用）+ 兑换卡启用            | **是** |
| 三  | 看板 + 每日报告 + 兑换审批                      | 否     |

第一段这么切是因为**数据搬迁不能再等**：第二段要改的 `habits`、第三段要读的
`days`，都应该先是 nono 真实的那一份，而不是空存档。先有导入，后面两段才有真数据可看。

**而第一段做完之后才看清：那份导入来的存档是「合法但不生效」的。** `normalizeSave` 对
`habits` 只做 `arr(raw.habits)`（原样透传数组），`importOnlineSave` 对它只做
`habits: onlineJson.tasks`（原样搬过去）—— 于是导入一份线上存档，18 条任务的
`starsReward` 没被改名成 `starReward`（`rewardOf` 读不到，打卡发 0⭐0🍖）、
`core` 字段根本不存在（`listCore` 返回空数组，`awardAllDone` 的
`core.length === 0` 护栏让今日全勤**永久不发**）。第一段接上了导入这根线，
第二段才是让那根线**真的通电**：`habits` 的元素收敛（`SAVE-20` ~ `22`）与线上 `tasks`
的字段映射（`IMPORT-17`）是任务管理的前置条件，不是顺带产出 ——
家长端要改的那个数组，得先是本仓库认得的形状。

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

### 线上的任务管理与规则页（第二段逆向自 `index-VUOSJfWA.js`）

任务管理页（`kB`，路由 `/parent/tasks`）是**一行一条任务**，三个可交互的东西：

```js
// 一行：名字边打边写、启用勾选框、一个「删」
<input value={t.name}    onChange={e => updateTask(t.id, { name: e.target.value })} />
<input type="checkbox" checked={t.enabled} onChange={e => updateTask(t.id, { enabled: e.target.checked })} />
<button onClick={() => deleteTask(t.id)}>删</button>
```

存档动作三个，都在 zustand 的 `set(produce(...))` 里：

```js
addTask: (n) => set(d => { d.tasks.push({ ...n, id: gr(), sortOrder: d.tasks.length + 1 }); });
updateTask: (id, patch) => set(d => { const i = d.tasks.findIndex(...); /* Object.assign 那一份 patch */ });
deleteTask: (id) => set(d => { d.tasks = d.tasks.filter(e => e.id !== id); });
// gr() = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
```

新增表单三个输入（名称、图标 emoji、类别下拉 `自律 / 健康 / 学习`），提交时补齐：

```js
addTask({
  name,
  icon,
  category,
  frequency: `daily`,
  starsReward: category === `learning` ? 2 : 1,
  foodPointsReward: category === `learning` ? 2 : 1,
  needsParentConfirm: !1,
  enabled: !0,
});
```

**注意它没传 `module`，也没传 `weeklyTarget`。** 线上加一条 `learning` 任务，
`module` 是 `undefined`。

规则页（`CB`，路由 `/parent/rules`）里兑换那一段三个输入：名字（边打边写）、
`medalCost`（`+e.target.value`，`type=number`）、`enabled` 勾选框，
都走同一个 `updateRewardRule(id, patch)`。**兑换页确实读 `enabled`**：

```js
i = useMemo(() => (t ?? []).filter(e => e.enabled), [t]);          // 列表过滤
requestExchange: (n) => { const t = rewardRules.find(e => e.id === n && e.enabled);
                          if (!t) { e.toast = `这个奖励暂时不可用`; return; } … }   // 动作再守一次
```

### 线上的已知缺陷

**第一段那六项**（前五项由第一段处置，第六项在存档层夹掉）：

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
   看板永远显示「差 99 项」。（第一段在存档层夹掉了。）

**第二段又找出四项**，全在任务管理与规则页上：

7. **`deleteTask` 硬删，无确认，且删掉的任务让历史对不上。** `tasks.filter` 直接把元素
   从数组里摘走，那个「删」是一个 `text-xs text-red-400` 的小字、点一下就掉。
   而历史打卡按 id 存在 `dailyRecords[日期键].completedTasks[id]` 里 ——
   任务定义没了，那些键就成了孤儿：`wB`（看板）用
   `tasks.filter(e => c?.completedTasks[e.id]?.completed)` 列今天完成了什么，
   删掉的任务当天打过卡也不再出现，「今天做了几件」当场少一件。
   本仓库更严重：`findHabit` 对未知 id **抛 `RangeError`**，
   而 `uncheckAndRefund` / `settle` 都先 `findHabit` —— 硬删一条打过卡的任务，
   当天点取消会抛错。
8. **`addTask` 的 `sortOrder` 用 `tasks.length + 1`，与删除组合起来会撞。**
   18 条时删掉第 3 条剩 17 条，新增那条拿到 `sortOrder: 18` —— 而原本的第 18 条
   （`bath`）也是 18。线上按 `sortOrder` 排序的地方于是有两条并列，顺序由
   `sort` 的稳定性决定，不由数据决定。
9. **新增 `learning` 类任务不带 `module`，那条任务永远打不上卡。** 线上五个学习子页是按
   `subCategory` / `module` 找记录的，`module` 为 `undefined` 的任务不属于任何子页，
   只能在看板上占一行。本仓库更直接：`learning.js::habitOf(save, module)` 用
   `find(item => item.module === module)`，加进来的那条任务任何子页都找不到它。
   `health` 类同理 —— `health.js` 的 `FIELDS` 是十一个写死的字段，
   新任务不在表里，健康页不会长出一格。
10. **`updateRewardRule` 能改价，而 `medalCost` 在兑换记录里是快照。** 线上改完价，
    历史记录里那条仍是旧价（这一点两边一致、也是对的），但**待兑现的申请**
    在线上是批准时才扣勋章 —— 改价之后那条 pending 的申请按新价扣。
    本仓库申请即扣，所以这个缺陷不存在；代价是改价这件事本轮**仍然不做**（见下）。

## 设计

### 三处偏离线上（第一段）

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

一个页面，`unlocked` 之后分三段：

| 页面                  | 内容                                                         |
| --------------------- | ------------------------------------------------------------ |
| `pages/parent/parent` | PIN 验证蒙层 → 通过后是家长首页                              |
| — 设置段              | 昵称 / PIN / 每日目标 / 备注（第一段）                       |
| — 任务段              | 18 条任务的启用与编辑 + 新增 + 兑换卡启用（**第二段**）      |
| — 数据段              | 导出 / 导入 / 清空（第一段）                                 |
| —                     | 第三段的看板 / 每日报告 / 兑换审批不在本轮，届时可能要拆页面 |

**PIN 验证与家长首页是同一个页面的两个状态，不是两个页面。** 分成两页要在
「验过了」这件事上落一个状态（存档字段或全局变量），而它不该跨页面存活 ——
退出家长端再进来必须重新验。同页两状态时那个「验过了」只是页面实例的一个字段，
`onUnload` 自然消失。

**第二段的任务管理因此也留在这一页，做成第三个 section，不新开
`pages/parent/tasks`。** 线上是一条独立路由（`/parent/tasks`），本仓库不跟 ——
新开一页就要回答「从家长首页跳过去要不要再验一次 PIN」：再验一次很烦，
不再验就得造一个跨页面的「验过了」（`app.globalData` 里一个时间戳），
而那正是上一条明确拒绝的东西。三段切换只多一个 `tab` 字段。
**代价要说清**：`parent.js` 会成为全仓最大的页面（第一段已经 286 行，第二段后约 500 行）。
第三段的看板进来时必须拆 —— 那时拆的是**看板**，因为它是只读的，
把它做成一个「从家长首页跳过去、进去前再验一次」的页面不别扭
（一天看一次的东西，多输四个数字可以接受）。

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

### 四处偏离线上（第二段）

| 项       | 线上                                 | 本仓库                                    |
| -------- | ------------------------------------ | ----------------------------------------- |
| 删任务   | `tasks.filter` 硬删，无确认          | **只能停用，没有删除函数**（软删除）      |
| 新增任务 | 三类都能加，`learning` 不带 `module` | **只能加 `habit` 类**                     |
| 排序     | `sortOrder` 只在新增时算一次         | **上移 / 下移，每次把整段重排成 `1..N`**  |
| 兑换卡   | 启用 + **改价**（`medalCost` 可改）  | **只有启用 / 停用**，`medalCost` 仍是常量 |

**删任务换成「只能停用」。** 线上那个「删」是一次不可逆的数据丢失：历史打卡按 id 存在
`days[日期键].checks[id]` 里，任务定义一没，那些键就成了孤儿（缺陷 7）。
本仓库更硬 —— `findHabit` 对未知 id 抛 `RangeError`，而 `uncheckAndRefund` 与
`health.js::settle` 都先 `findHabit`：硬删一条今天打过卡的任务，孩子点取消打卡会**抛错**。
所以 `parentTasks.js` **没有 `removeHabit`**，停用走 `saveHabit(save, id, { enabled: false })`
那一条（`enabled` 是四组可改字段里的一个，不单开一个函数）：
`enabled: false` 的任务不出现在首页（`listHabits` 已经过滤）、不计入分母
（`dayProgress` 与 `listCore` 都跟着 `enabled` 走），
而历史永远解析得出来。**这不是「先不做删除，以后再说」——「不能真删」是本轮的结论**，
理由是打卡记录按 id 存这件事不会变。18 条任务永远躺在 `habits` 里，最坏的代价是
数组不会变短，而它的量级是 18 + 家长手加的几条。

**新增任务只能加 `habit` 类。** 线上三类都能加，但另外两类加了不管用（缺陷 9）：

| 类别       | 线上加完的结果                  | 本仓库为什么不给                                           |
| ---------- | ------------------------------- | ---------------------------------------------------------- |
| `habit`    | 首页多一格，能打卡              | **给** —— `listHabits` 只看 `category` 与 `enabled`        |
| `learning` | `module` 为 `undefined`，无页面 | `habitOf(save, module)` 找不到它；给它一个子页要写一个页面 |
| `health`   | 健康页不长格子                  | `health.js::FIELDS` 是十一个写死的字段，新字段没有 UI      |

**判据是「加完之后有没有地方能打上这一卡」**，不是「哪一类看起来更重要」。
`learning` 要真能加，得先有「自定义学习子页」这个东西；`health` 要真能加，
得把 `FIELDS` 那张注册表搬进存档。两件都比本轮大，而线上那个下拉框是
**给了入口却到不了终点**的典型 —— 不给入口比给一个坏的好
（`AGENTS.md` 第 5 节第 4 条：不写不可达的路径）。

新任务的默认值：`category: 'habit'`、`frequency: 'daily'`、
`starReward: 1` / `petFoodReward: 1`（线上 `habit` 类同值）、
`needsParentConfirm: false`、`enabled: true`、`core: false`、`sortOrder` 排在最后。
**`core` 落 `false`**：家长新加的任务不该自动进今日全勤的分母 ——
那会让「今天全勤」的门槛在她加完任务的那一刻悄悄变高，而昨天已经全勤过了。
要计入得自己勾（那是可改字段之一）。

**id 自己生成，与线上同形但不同源。** 线上是
`` `${Date.now()}-${Math.random().toString(36).slice(2,9)}` ``——
`utils/` 里不能读 `Date.now()`，也不能有随机源（`AGENTS.md` 第 3 节），
所以 id 由 `addHabit(save, form, now)` 用**传进来的 `now`** 拼：`` `t${now}` ``，
撞了就追加 `-2` / `-3`（同一毫秒连点两次的唯一可能）。
这样它仍然是纯函数：同样的 `save` 与 `now` 给同样的 id。
**不用 `habit-19` 这种序号**：序号会与「停用不删」打架 —— 删不掉的旧任务让序号只增不减，
而看到 `habit-42` 的人会以为有 42 条任务。

### 四组可改字段，白名单照 `saveSettings`

```js
saveHabit(save, habitId, patch); // 改一条任务，patch 走白名单
addHabit(save, form, now); // 加一条 habit 类任务，返回新存档
moveHabit(save, habitId, delta); // 上移 / 下移，整段重排成 1..N
toggleReward(save, rewardId); // 兑换卡的启用 / 停用
parentTasks(save); // 任务段的读取入口
```

可改的字段**四组**，其余一概抛 `RangeError`：

| 组         | 字段                           | 为什么可改                                       |
| ---------- | ------------------------------ | ------------------------------------------------ |
| 显示与开关 | `name` / `icon` / `enabled`    | 线上就这三个（`name` 与 `enabled`），加 `icon`   |
| 产出       | `starReward` / `petFoodReward` | 线上在规则页改全局费率，本仓库费率在任务自己身上 |
| 顺序       | `sortOrder`（经 `moveHabit`）  | 家长排首页九格的顺序，线上有这个字段但不给入口   |
| 全勤名单   | `core`                         | 本仓库特有 —— 线上是 utils 里的平行数组          |

**不可改的是 `id` / `category` / `frequency` / `module` / `weeklyTarget` / `needsParentConfirm`。**
前四个改了等于换一条任务（`id` 丢历史、`category` 让它在另一个页面上现身、
`module` 指向别的子页）；后两个在全仓**零读取点** —— `weeklyTarget` 只有
`health.js:157` 一处读且只读 `bath` 那条，`needsParentConfirm` 一处都没有。
**给一个没人读的字段做输入框，是给家长一个改了不生效的旋钮。**
`needsParentConfirm` 的读取路径在第三段（兑换审批那一轮要不要连任务也审），
到那时再给入口。

**白名单 + `RangeError` + 无变化返回入参**，三条与 `saveSettings` 同形
（第一段 `summary.md` 定下的家长端写入约定）。为什么不做一个「万能 patch」：
`habits` 的元素有 12 个字段，其中 6 个改了就是错的 —— 万能 patch 等于把
「哪些能改」这个判断从函数搬到调用方，而调用方是页面。

`starReward` / `petFoodReward` 夹 `0` ~ `10` 并取整。上界 10 不是怕溢出，
是怕「一次打卡 999 星光」把兑换那条链的意义抹掉（3 勋章换一集动画片，
而勋章只从全勤与成就来 —— 星光通胀不直接通到勋章，但它让首页那个数字失去参照）。
下界 0 是允许的：`rewardOf` 落 0 就是不发，那是一条「只记录不奖励」的任务，
比停用它更贴近某些真实需求（睡前故事记了但不给星星）。

### `core` 归零：护栏在 `POINT`，警告在页面

家长可以把七条 `core` 全停用，或把它们的 `core` 都改成 `false`。那时
`listCore(save)` 返回空数组，而 `awardAllDone` 的第一句是：

```js
const core = listCore(save);
if (core.length === 0 || coreDone(save, key) < core.length) return save;
```

**`core.length === 0` 那一支已经在 P3-b 写好了**（`POINT-26`：七条核心项全被停用 →
不算全勤，不发勋章）。所以第二段**不加新的 `POINT` 规格**，也不在 `parentTasks.js` 里
拦住「最后一条 core 也被关掉」—— 拦住它等于给家长一个「这项不能关」的错误，
而她想关掉的可能正是那一项（孩子生病那周不要求排便打卡）。

处置是**页面上一句话**：`parentTasks(save)` 返回 `coreCount`，
为 `0` 时任务段顶部显示「现在没有核心任务，今日全勤不会发放」。
这是「状态可解释」（`vision.md`「什么算好」第 5 条）而不是门禁：
家长看得见后果，仍然可以那么做。

同一条也覆盖周奖励与 `full-week` 成就 —— 三者共用 `isQualifiedDay`
（`coreDone >= 5`），`core` 少于 5 条时那三样都不再可能达成。
所以那句话的门槛是 `coreCount < 5` 时也提示（「核心任务少于 5 条，周奖励不会发放」）。

### 兑换卡启用：新开顶层键 `rewardFlags`

`data/rewards.js` 是常量区（三条卡），而「这张卡现在能不能换」是**家长的状态**，
不是内容。两条路：把三条卡整份搬进存档（线上的做法，`rewardRules`），
或者只存一个开关表。选后者：

```js
rewardFlags: { snack: true, cartoon: true, money: false },   // 顶层键，SAVE-23
```

**理由是改价不做。** 卡整份进存档，`name` / `icon` / `medalCost` 就都跟着可写了 ——
而 `medalCost` 可写会让「同一张卡不同时期不同价」进入历史记录的比对
（`rewards.js` 头注释已经写明「记录里是快照」），改价这件事本轮明确不做。
只存开关，存档里就只有一个布尔，`medalCost` 想改也没地方改。
代价是 `rewardFlags` 与 `REWARDS` 要对得上：`rewardFlags` 里出现未登记的 id
就是脏数据，`normalizeSave` 认不出来（它不能 import `data/`）——
所以**收敛只做「值收敛成布尔」，未知 id 原样留着**，由 `reward.js` 读的时候忽略。
这与 `days` 的透传同一条：本层不认得的键不删（删了就丢数据），只是没人读。

**默认全 `true`**，缺键也当 `true`：一张没被明确停用的卡应该能换。
写成「缺键 = 停用」会让存档里没有 `rewardFlags` 的老用户一张卡都换不了。

**守卫两处，与线上一致：**

```js
rewardState(save, key, now).items; // 只列启用的（页面过滤）—— REWARD-16
redeem(save, key, 'snack', now); // 停用时原样返回入参 —— REWARD-17
```

为什么两处都要：只过滤列表，页面上确实点不到，但 `redeem` 就成了一个
「谁调都能扣勋章」的函数 —— 而奖励中心那个页面之后还会被第三段改。
只守 `redeem`，停用的卡还留在列表里，点了给一句「暂时不可用」，
对 5 岁的孩子是「为什么给我看又不让我换」。线上两处都做了，这一处照抄。
`redeem` 的停用分支**返回入参本身**而不是抛错：「这张卡被家长关了」是正常状态，
与勋章不够那一支同形（`REWARD-06`），不是编程错误。

`toggleReward(save, rewardId)` 对未登记的 id 抛 `RangeError`
（页面的 id 全部来自 `rewardState().items`，传错只可能是编程错误）。
它落在 `parentTasks.js` 而不是 `reward.js`：**写入是家长域的动作**，
`reward.js` 那一侧只加读取时的守卫。

### `habits` 的元素收敛（`SAVE-20` ~ `22`）与线上映射（`IMPORT-17`）

这是第二段真正的前置条件。`normalizeSave` 现在对 `habits` 只有一句
`arr(raw.habits)`，`storage/doc.md` 里那段「为什么这两个数组要收敛而
`habits` / `days` 不用」写着「`habits` 的元素由 `HABIT` 区定义……本层认不出好坏」——
**那句话在家长端能写 `habits` 之后不再成立**：元素字段就是几个数、几个字符串、
两个布尔，和 `redemptions` 一样认得出好坏，而现在有一个写入路径会把家长的输入送进去。

```js
{
  id: 'wake',                 // 非空字符串，坏的整条丢掉（没有 id 的任务无法打卡）
  name: '按时起床',           // 非空字符串，坏的落 '未命名'
  icon: '🌅',                 // 字符串，坏的落 '⭐'（线上新增表单的默认图标）
  category: 'habit',          // 三取值之一，坏的落 'habit'
  frequency: 'daily',         // 两取值之一，坏的落 'daily'
  starReward: 1,              // 0 ~ 10 整数
  petFoodReward: 1,           // 0 ~ 10 整数
  needsParentConfirm: false,  // 布尔
  enabled: true,              // 布尔，坏的落 true（不明不白地少一格比多一格糟）
  sortOrder: 1,               // 非负整数，坏的落 0
  core: true,                 // 布尔，坏的落 false
  module: 'literacy',         // 仅 category === 'learning' 时保留，非空字符串
  weeklyTarget: 3,            // 仅 frequency === 'weekly' 时保留，正整数
}
```

**两个字段是条件保留的**，这是 `habits` 与 `redemptions` 唯一的结构差别：
`module` 只在 `learning` 类上有意义、`weeklyTarget` 只在 `weekly` 上有意义，
无条件补默认值会让 18 条任务里 13 条多一个 `module: ''` ——
而 `habitOf` 用 `find(item => item.module === module)` 找任务，
一堆空串会在有人不小心传空串时匹配到第一条。**条件字段不补，是为了让缺席保持缺席。**

**`id` 坏就整条丢掉**，与 `redemptions` 的「非对象整条丢掉」同一条。
没有 id 的任务打不了卡、也改不了，留着只是让首页多一个点不动的格子。
重复 id 只留第一条（`checks[id]` 是按 id 存的，两条同 id 的任务共享打卡状态）。

**`save.js` 不能 import `data/defaultHabits.js`**（它零依赖，`seedHabits` 因此在
`habit.js`）。所以这层的默认值是字面量 `'habit'` / `'daily'` / `'⭐'` 这种，
不回查默认表。三个类别与两个 frequency 各是一个模块级常量数组，
与 `REDEMPTION_STATUS` 同形。

`IMPORT-17` 的映射：

| 线上字段           | 本仓库字段      | 说明                                                                                                                           |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `starsReward`      | `starReward`    | 改名，glossary 的规范名                                                                                                        |
| `foodPointsReward` | `petFoodReward` | 改名                                                                                                                           |
| `subCategory`      | —               | 线上死字段，不接（与 `defaultHabits.js` 不转抄同一条）                                                                         |
| —（线上没有）      | `core`          | 落 `false`，理由见下                                                                                                           |
| 其余同名           | 同名            | `id` / `name` / `icon` / `category` / `frequency` / `needsParentConfirm` / `enabled` / `sortOrder` / `module` / `weeklyTarget` |

**`core` 落 `false` 而不是照本仓库的默认表补七条 `true`。** 这一条要写清理由，
因为它看着像 bug：线上的全勤名单是 utils 里一个平行数组
（`[wake, brush-am, literacy, reading, exercise, vegetables, poop, bath]`，八条含
`bath`），**不在任务元素上**，所以导入时没有来源。两条路：

- 落 `false` —— 导入后今日全勤不发，家长得自己去任务段勾。
- 按 id 猜 —— 在 `importOnline.js` 里写一份 id → `core` 的对照表。

选前者，但**不是**因为「线上没有就不猜」（`pet.lastFedAt` 那一条）——
而是因为**那份对照表会与 `defaultHabits.js` 的 `core` 字段构成第二个名单**。
P3-b 明确把名单从「utils 里的平行数组」搬到「任务自己的字段」，
理由是平行数组会让家长删掉一条核心任务后全勤永久不可达。
在 importer 里再写一份 id 数组，等于把那个被拆掉的东西原地重建一遍。

代价是导入后要手动勾七下。**处置是 `seedHabits` 之外的一条补齐**：
导入落盘后页面提示「导入完成。任务的全勤名单需要在任务段确认」，
并且任务段每条任务都有 `core` 开关（本来就有）。
**七下的代价换掉一份平行名单，值。** 而且它只发生一次 —— 导入是一次性动作。

`sortOrder` 原样接：线上那份 18 条的 `sortOrder` 与 `defaultHabits.js` 一致
（后者就是从前者转抄的）。缺陷 8（新增时 `tasks.length + 1` 会撞）的处置不在导入侧 ——
导入来的是线上攒下的数据，撞了也已经撞了；本仓库的 `moveHabit`
**每次把整段重排成 `1..N`**，第一次调用就把撞的解开。

**`days`（`dailyRecords`）的内部结构仍然不接。** 线上
`completedTasks[id] = { completed: true, completedAt: ISO }`，
而本仓库是 `checks[id] = { at: 毫秒 }` —— 而且线上取消打卡**写墓碑**
（`completedTasks[id] = { completed: false }`），本仓库删键。
映射它要处理「墓碑算不算打过卡」（不算，但键存在），
还要把 ISO 转毫秒、还要处理 `learning` / `health` / `ledger` 三个兄弟键
—— 那是一份与本轮同量级的活。**第三段的看板要读 `days`，那时再接**，
本轮的范围外多一条。所以导入之后：任务定义生效了（能打卡、能发星光），
但历史打卡记录还是原样透传的线上形状 —— 首页看不到它们，看板（第三段）才会。

### `parentTasks(save)`：任务段的读取入口

```js
{
  habits: [                 // 全部 18 条，按 sortOrder 升序，含停用的
    { id: 'wake', name: '按时起床', icon: '🌅', category: 'habit',
      starReward: 1, petFoodReward: 1, enabled: true, core: true,
      editable: true,       // category === 'habit'（另两类只能改 enabled / core / 产出）
      first: true, last: false },   // 上移 / 下移按钮要不要禁用
  ],
  coreCount: 7,             // 启用中的核心项条数，0 或 < 5 时页面出提示
  coreWarn: null,           // null | 'none' | 'few' —— 页面不自己比数
  rewards: [                // 三条卡，含停用的
    { id: 'snack', name: '零食一次', icon: '🍪', medalCost: 2, enabled: true },
  ],
}
```

**列全部 18 条，不过滤 `enabled`** —— 与 `listHabits` 正相反：家长端要看见停用的那些，
否则关掉之后就再也开不回来。同一条适用于 `rewards`。

**`editable` 是本仓库特有的一格。** `learning` / `health` 两类的 `name` 与 `icon`
不给改：`learning` 的名字在入口页由 `data/learningModules.js` 给（改了任务名
入口页不跟着变，两处会不一致），`health` 的四条名字写在健康页的模板里。
产出值与 `enabled` / `core` 三类都能改 —— 那三个是本仓库真的会读的字段。
**`editable` 由 utils 算，不由页面判 `category`**：页面判等于把
「哪些字段哪一类能改」抄第二遍，而 `saveHabit` 的白名单已经是那个判断的唯一处
（同一条见 `petState().types` / `READ_OPTIONS`）。

**`first` / `last` 由 utils 给，不让页面比 `index === 0`。** 页面拿到的数组已经排过序，
但「第一条的上移要禁用」这个判断放在页面里，就会在将来加了分组渲染之后错 ——
而 `moveHabit(save, id, -1)` 对第一条**返回入参本身**（无变化），
两处于是说同一件事：`first` 是给按钮置灰的，返回入参是给点了也没事的。

**`coreWarn` 是原因码不是布尔**，取值 `null` / `'none'`（一条不剩）/ `'few'`（少于 5 条）。
页面按它选一句话。与 `learningBlock` / `verifyPin().reason` 同一套约定 ——
页面不写 `coreCount === 0 ? … : coreCount < 5 ? … : …` 这种链，
因为那个 `5` 是 `WEEKLY_BONUS.minDays`，属于 `POINT` 区。

### `moveHabit`：整段重排成 `1..N`

上移 / 下移只在**同一 `category` 内**移动，跨类不移：三类任务分别渲染在
首页九格、学习入口页、健康页，把一条 `health` 移到 `habit` 中间没有任何可观测效果
（`listHabits` 按 `category` 过滤，`sortOrder` 只在组内比）。

落盘前走一个内部的 `reindex`：按 `habit` → `learning` → `health` 的次序，
把三段的 `sortOrder` 重排成全局连续的 `1..N`（组内相对顺序保持）。
默认表下这就是它现在的样子（`1..9` / `10..14` / `15..18`），所以
「在 `learning` 段内下移」不会改到另外两段的任何一个值。

为什么整段重排而不是交换两个值：交换只在「当前值本来就连续无重复」时正确，
而线上缺陷 8 已经产出了重复值，导入来的存档里就可能有。
**重排让「值是否连续」不再是前提**，一次调用就修好。
`addHabit` 用同一个 `reindex`，所以新任务排在 `habit` 段末尾之后，
`learning` / `health` 两段整体后移一位 —— 段与段永不交叠。

`delta` 只认 `-1` / `1`，其余抛 `RangeError`（页面只有两个按钮）。
移到边界外返回入参本身。

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

### 第一段追加到存储层的规格

`parent.pinFails` / `pinLockedUntil` 的默认值与收敛（`SAVE-19`）、
`dailyGoal` 的上界、以及线上四字段的导入映射（`IMPORT-16`）声明在
`docs/features/storage/doc.md`，本表不重复 —— 与 `SAVE-18` / `IMPORT-15` 同一条分工：
**存档形状归 `SAVE` / `IMPORT` 区，家长域只声明 `PARENT-NN`。**

`PARENT-05` / `PARENT-06` 是本轮偏离线上最要紧的一对：线上输错无限次，
少了 `PARENT-06`（冷却期间不累加）那 60 秒会被乱点续成永久。

`PARENT-17` / `PARENT-18` 一起钉住导出：只有 `PARENT-17` 会被
「导出一个 `{}`」蒙过（它也能 `JSON.parse`），只有 `PARENT-18` 会被
「导出时丢了 `days`」蒙过。

### 任务管理与兑换卡启用（`PARENT`，第二段）

`miniprogram/utils/parentTasks.js` 的五个函数。

| Spec ID   | 输入                                                              | 期望输出                                                                                                                                            |
| --------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| PARENT-24 | 默认存档 `parentTasks`                                            | `habits` 18 条（含停用的），按 `sortOrder` 升序；`coreCount` 为 `7`、`coreWarn` 为 `null`                                                           |
| PARENT-25 | 同上，看 `habits` 的元素                                          | 每条带 `editable`（`category === 'habit'` 的九条为 `true`，另九条为 `false`）与 `first` / `last`                                                    |
| PARENT-26 | 停用了 `poop` 的存档 `parentTasks`                                | 那条**仍在列表里**且 `enabled` 为 `false`；`coreCount` 为 `6`                                                                                       |
| PARENT-27 | 七条核心项全停用                                                  | `coreCount` 为 `0`、`coreWarn` 为 `'none'`                                                                                                          |
| PARENT-28 | 只剩 4 条核心项启用                                               | `coreCount` 为 `4`、`coreWarn` 为 `'few'`（阈值是 `WEEKLY_BONUS.minDays` 的 5）                                                                     |
| PARENT-29 | `saveHabit(save, 'wake', { name: '起床', icon: '⏰' })`           | 那一条的两个字段都改了，其余 17 条与其它字段不动                                                                                                    |
| PARENT-30 | `saveHabit(save, 'wake', { enabled: false })`                     | `enabled` 为 `false`；`listHabits` 少一格、`listCore` 少一条（分母跟着变）                                                                          |
| PARENT-31 | `saveHabit(save, 'wake', { core: false })`                        | `core` 为 `false`，`listCore` 少一条                                                                                                                |
| PARENT-32 | `saveHabit(save, 'wake', { starReward: 99 })`                     | 夹到 `10`；`-3` 夹到 `0`；`2.6` 取整成 `3`                                                                                                          |
| PARENT-33 | `saveHabit(save, 'wake', { name: '   ' })`（全空白）              | 回落 `'未命名'`（不落空串 —— 首页那一格会变成看不见的按钮）                                                                                         |
| PARENT-34 | `saveHabit(save, 'wake', { id: 'x' })` / `{ category: 'health' }` | 抛 `RangeError`（六个不可改字段：`id` / `category` / `frequency` / `module` / `weeklyTarget` / `needsParentConfirm`）                               |
| PARENT-35 | `saveHabit(save, 'wake', { sortOrder: 5 })`                       | 抛 `RangeError`（顺序只能走 `moveHabit`，两个入口会让重排的前提失效）                                                                               |
| PARENT-36 | `saveHabit(save, 'literacy', { name: 'x' })`（`learning` 类）     | 抛 `RangeError`（`editable` 为 `false` 的两类只能改 `enabled` / `core` / 两个产出）                                                                 |
| PARENT-37 | `saveHabit(save, 'literacy', { enabled: false })`                 | 改成功 —— 那四个字段与 `category` 无关                                                                                                              |
| PARENT-38 | `saveHabit(save, '不存在的id', { name: 'x' })`                    | 抛 `RangeError`（页面的 id 全部来自 `parentTasks`）                                                                                                 |
| PARENT-39 | `saveHabit(save, 'wake', {})` / 传的值与现值全同                  | **原样返回入参**（对象同一性）                                                                                                                      |
| PARENT-40 | `addHabit(save, { name: '收拾书包', icon: '🎒' }, now)`           | `habits` 多一条：`category: 'habit'`、`frequency: 'daily'`、`starReward` / `petFoodReward` 各 `1`、`enabled: true`、`core: false`                   |
| PARENT-41 | 同上，看 `id` 与 `sortOrder`                                      | `id` 为 `` `t${now}` ``；`sortOrder` 为 `10`（排在 `habit` 段末尾），`learning` 五条整体后移成 `11` ~ `15`、`health` 成 `16` ~ `19` —— 段与段不交叠 |
| PARENT-42 | 同一个 `now` 连着 `addHabit` 两次                                 | 第二条的 `id` 是 `` `t${now}-2` ``（同毫秒不撞）                                                                                                    |
| PARENT-43 | `addHabit(save, { name: '   ' }, now)`（名字全空白）              | 抛 `RangeError`（新增是提交路径，名字是必填项 —— 与 `saveHabit` 的回落不同）                                                                        |
| PARENT-44 | `addHabit(save, { name: 'x', category: 'learning' }, now)`        | 抛 `RangeError`（只能加 `habit` 类，缺陷 9：加完没有页面能打上这一卡）                                                                              |
| PARENT-45 | `addHabit` 的 `now` 非有限数                                      | 抛 `TypeError`（`id` 要用它拼）                                                                                                                     |
| PARENT-46 | `moveHabit(save, 'brush-am', -1)`（第二条上移）                   | 它与 `wake` 换位；`habit` 类九条的 `sortOrder` 重排成连续整数                                                                                       |
| PARENT-47 | `moveHabit(save, 'wake', -1)`（第一条上移）                       | **原样返回入参**（对象同一性），`parentTasks` 里它的 `first` 为 `true`                                                                              |
| PARENT-48 | `sortOrder` 有重复值的脏存档（缺陷 8 的产物）上 `moveHabit`       | 重排后那一类的 `sortOrder` 无重复且连续                                                                                                             |
| PARENT-49 | `moveHabit(save, 'literacy', 1)`（`learning` 类内下移）           | `literacy` 与 `reading` 换位；`habit` 段的九个 `sortOrder` 一个没变，`health` 段也没变                                                              |
| PARENT-50 | `moveHabit(save, 'wake', 2)` / `delta` 为 `0`                     | 抛 `RangeError`（页面只有上移 / 下移两个按钮）                                                                                                      |
| PARENT-51 | `toggleReward(save, 'snack')` 两次                                | 第一次 `rewardFlags.snack` 为 `false`、第二次回 `true`；`data/rewards.js` 不动                                                                      |
| PARENT-52 | `toggleReward(save, '不存在的id')`                                | 抛 `RangeError`                                                                                                                                     |
| PARENT-53 | 停用 `snack` 后 `parentTasks(save).rewards`                       | 三条**都在**，`snack` 的 `enabled` 为 `false`（家长端要能开回来）                                                                                   |

### 第二段追加到存储层与 `REWARD` 区的规格

`habits` 的元素收敛（`SAVE-20` ~ `SAVE-22`）、`rewardFlags` 的默认值与收敛（`SAVE-23`）、
线上 `tasks` 的字段映射（`IMPORT-17`）、`rewardFlags` 不从线上来（`IMPORT-18`）
声明在 `docs/features/storage/doc.md`；兑换的两处启用守卫（`REWARD-16` / `REWARD-17`）
声明在 `docs/features/reward/doc.md`。本表不重复 —— 与第一段同一条分工：
**存档形状归 `SAVE` / `IMPORT`，兑换行为归 `REWARD`，家长域只声明 `PARENT-NN`。**

`PARENT-30` / `PARENT-31` 看着重复，钉的是两件不同的事：停用改的是
「首页显示不显示」（`listHabits`）**与**「全勤分母」（`listCore` 同时看 `core` 与
`enabled`），而改 `core` 只动后者。少了 `PARENT-31`，一个只过滤 `enabled` 的
`listCore` 也能全绿。

`PARENT-34` / `PARENT-35` / `PARENT-36` 是三种不同的「不能改」：
字段本身不可改（六个）、字段要走另一个入口（`sortOrder`）、字段这一类不可改
（`learning` / `health` 的 `name`）。三条各挡一个方向 ——
一个只查白名单的实现能过 `PARENT-34` 但过不了后两条。

`PARENT-43` 与 `PARENT-33` 是**同一个字段的两种策略**，故意不一致：
`saveHabit` 收敛（改名改成空白 → 落 `'未命名'`，家长在编辑已有任务，
不该因为一次误删就丢掉那一行），`addHabit` 抛错（新增是提交路径，
空名字的任务不该被造出来）。这一对与 `normalizeSave` 收敛 / `importOnlineSave`
抛错那一对同构：**同一份数据，读路径收敛、写路径严格。**

`PARENT-47` 与 `PARENT-39` 都断言对象同一性，覆盖的是家长端写入约定的第三条
（无变化返回入参）。`PARENT-48` 是唯一一条直接冲着线上缺陷 8 去的规格。

`PARENT-53` 挡住一个很容易写成的实现：`parentTasks` 直接复用
`rewardState().items`（第二段之后它已经过滤了 `enabled`）——
那样家长端就看不到停用的卡，关掉一张就再也开不回来。
**「读取入口过滤 `enabled`」与「家长端列全部」是两个相反的需求，
所以是两个函数**，不是同一个加参数。

## 范围外

- ~~**不做任务管理。**~~ 第二段做了：`utils/parentTasks.js` 的
  `saveHabit` / `addHabit` / `moveHabit`（`PARENT-24` ~ `50`），
  `habit/doc.md` 那条「写入路径在 `PARENT`（P7）」的预告到此兑现。
  但 **`needsParentConfirm` 仍然不给入口** —— 它在全仓零读取点，
  给一个改了不生效的开关比不给更糟；它的读取路径在第三段（兑换审批）。
- **不做删除任务，只能停用。** 这不是「以后再做」，是**结论**：历史打卡按 id 存在
  `days[日期键].checks[id]` 里，任务定义一删，`findHabit` 就对那些 id 抛 `RangeError`
  （取消打卡这条路径会崩）。软删除让历史永远解析得出来，代价只是数组不变短。
  线上那个「删」是缺陷 7。
- **不做新增 `learning` / `health` 类任务。** 加完没有任何页面能打上这一卡
  （缺陷 9）：`learning` 要有子页与 `module` 绑定，`health` 的十一个字段写死在
  `health.js::FIELDS` 里。要真能加，得先有「自定义学习子页」或把 `FIELDS` 搬进存档。
- **不做改 `id` / `category` / `frequency` / `module` / `weeklyTarget`。**
  前四个改了等于换一条任务，`weeklyTarget` 只被 `bath` 那一条读。
- **不做积分规则页与兑换价格可改。** `REWARDS` 的 `medalCost` 保持常量：
  改价会让「同一张卡不同时期不同价」进入历史记录的比对逻辑，而
  `rewards.js` 头注释已经写明「记录里是快照」。线上的 `pointRules`（全局费率）
  同样不做 —— 本仓库的费率在**任务自己身上**（`starReward` / `petFoodReward`），
  第二段给的正是改那两个字段的入口，全局费率表因此没有位置。
  `importOnline.js` 的 `rewardRules` / `pointRules` 于是**永久不接**。
- ~~**不做兑换卡启用。**~~ 第二段做了：顶层键 `rewardFlags`（`SAVE-23`）+
  `toggleReward`（`PARENT-51` ~ `53`）+ 兑换侧两处守卫（`REWARD-16` / `REWARD-17`）。
- **不做「改了产出值之后当天取消按老值退」。** `point.js::uncheckAndRefund` 的头注释
  把这件事留给了 P7 评估，结论是**不做**：按发放时的数额退要在
  `days[key].checks[id]` 里多存一份当时的产出值，而 `checks` 的不变式是
  「键存在即已打卡」（`HABIT` 区定的），加字段就得同时改导入映射与所有读取点。
  实际影响是家长改完产出值的当天、孩子取消一次打卡会多扣或少扣 1~2 点 ——
  用一句话说明比改存档结构划算：任务段编辑产出值时提示
  「改动从下一次打卡生效，今天已打的卡取消时按新值退」。
- **不做导入 `days`（线上 `dailyRecords`）的内部结构。** 线上
  `completedTasks[id] = { completed, completedAt }` 且取消打卡**写墓碑**，
  本仓库是 `checks[id] = { at }` 且删键；还要转 ISO、还要处理
  `learning` / `health` / `ledger` 三个兄弟键。**第三段的看板要读 `days`，那时再接。**
  所以第二段之后：导入来的任务定义生效了（能打卡、能发星光、能进全勤），
  历史打卡记录仍是原样透传的线上形状。
- **不做看板、每日报告、兑换审批。** 第三段。`redemptions` 里
  `status: 'pending'` 的记录本轮仍然只能看不能批（与 `REWARD` 区现状一致）。
- **不做宠物改名。** 它卡在 `choosePet` 会覆盖 `name`（`pet/doc.md` 记着），
  要先解掉那个才能给入口。
- **不做每日新字数 / 每周首数 / 每天题数可配。** 三份 `doc.md` 都把它列在范围外，
  本轮不动：它们是常量，进设置要先拍板「改小了已经学过的怎么办」。
- **不做已掌握重学 / 已会背重学。** 同上，是内容调度的事不是设置的事。
- **不做 PIN 哈希、不做 PIN 找回。** 明文 4 位，忘了只能清空数据 ——
  `docs/vision.md` 那条 `待确认` 第一段拍成定论（理由见上文）。
- **不做反向迁移。** `exportJson` 导出的是本仓库存档原文，**导不回线上**
  （线上读 `parentSettings` / `tasks` / `dailyRecords` 那套字段名）。
  它只用于备份与调试。写一个反向映射表要维护两份，而线上那份 PWA 不再演进。
- **不做导入的合并模式。** 整份覆盖，`vision.md`「数据迁移」一节已定。
- **不做家长端 tab。** tabBar 仍是四个（首页 / 学习 / 健康 / 宠物）——
  家长端藏在长按后面，出现在 tab 里就不叫藏了。
- **不拆第二个页面。** 任务段是 `pages/parent/parent` 的第三个 section，
  不新开 `pages/parent/tasks`（线上那条独立路由不跟）—— 新开一页就要回答
  「跳过去要不要再验一次 PIN」，而跨页面的「验过了」正是第一段明确拒绝的东西。
  第三段的看板进来时再拆（只读、一天看一次，进去前再验一次不别扭）。
- **不做音效开关。** 线上数据条上有一个，而全仓至今零音频资源
  （`math/doc.md` 范围外同一条）。`soundEnabled` 字段在存档里躺着，本轮不给入口。
- **不做多孩子档位。** `vision.md`「明确不做」已定，存档是单例。
