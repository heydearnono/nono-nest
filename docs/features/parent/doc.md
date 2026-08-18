# 家长端（PIN 入口 · 设置 · 数据搬迁 · 任务管理 · 看板与审批）

- 区名：`PARENT`（家长端 PIN、设置、任务管理、规则、报告）
- 模块：`miniprogram/utils/parent.js`、`miniprogram/utils/parentTasks.js`、
  `miniprogram/utils/parentReport.js`、
  `miniprogram/pages/parent/`、`miniprogram/pages/board/`
- 状态：**第一段已完成**（`PARENT-01` ~ `23`，见 `summary.md`）；
  **第二段已完成**（任务管理 + 兑换卡启用，`PARENT-24` ~ `53`）；
  **第三段（看板 + 每日报告 + 兑换审批）是本轮**（`PARENT-54` ~ `77`）
- 关联愿景：`docs/vision.md` P7（家长后台）
- 顺带产出：第一段补了 `parent` 的两个 PIN 节流字段（`SAVE-19` / `IMPORT-16`）、
  首页的长按入口、**全仓第一个 `importOnlineSave` 调用点**；
  第二段给 `habits` 补元素收敛与线上字段映射（`SAVE-20` ~ `22` / `IMPORT-17`），
  让导入来的任务**真的生效**，新开一个顶层键 `rewardFlags`（`SAVE-23` / `IMPORT-18`），
  并给 `REWARD` 区补两条启用守卫的规格（`REWARD-16` / `REWARD-17`）；
  第三段接上**线上 `dailyRecords` 的内部结构**（`IMPORT-19` ~ `21`，全仓最后一份
  没接的线上数据）、给 `redemptions.status` 加第三个取值 `'cancelled'`（`SAVE-24`）
  与它的一句话（`REWARD-18`）

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
| 二  | 任务管理（增删改与启用）+ 兑换卡启用            | 已完成 |
| 三  | 看板 + 每日报告 + 兑换审批                      | **是** |

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

### 线上的看板、每日报告与兑换审批（第三段逆向自 `index-VUOSJfWA.js`）

线上 `/parent` 这一页本身就是看板（`yB()`，`.scratch/index-VUOSJfWA.js:684151`），
下面挂着四个入口（`.scratch/index-VUOSJfWA.js:688800`：任务管理 / 积分与兑换 /
每日报告 / 家长设置）、一张数据卡（`xB()`）与一张待审批卡（`bB()`）。
每日报告是另一条路由（`wB()`，`.scratch/index-VUOSJfWA.js:695875`）。

看板由四块组成：

```js
// .scratch/index-VUOSJfWA.js:684151 —— 四个数与三条线的来源
let u = t.filter((e) => e.enabled).length, // 「今日目标」的分母：全部启用任务
  d = c ? Object.values(c.completedTasks).filter((e) => e.completed).length : 0,
  f = l.filter((t) => {
    let n = e[t]; // 本周「打卡天数」：任意一项即算
    return n && Object.values(n.completedTasks).some((e) => e.completed);
  }).length,
  p = d >= a.dailyGoal; // 达标
// .scratch/index-VUOSJfWA.js:244157 —— 趋势的每日百分比
function Sr(e, t, n) {
  return t.map((t) => {
    let r = e[t];
    if (!r || n.length === 0) return 0;
    let i = n.filter((e) => r.completedTasks[e]?.completed).length;
    return Math.round((i / n.length) * 100);
  });
}
// .scratch/index-VUOSJfWA.js:688071 —— 打卡日历：i = u，今天的启用数当每一天的分母
l.map((t, n) => {
  let r = e[t],
    i = u,
    a = r ? Object.values(r.completedTasks).filter((e) => e.completed).length : 0,
    o = i ? a / i : 0;
});
```

三条线（学习 / 自律 / 健康）由 `Er` / `wr` / `Tr`
（`.scratch/index-VUOSJfWA.js:244480` / `:244400` / `:244561`）各取一份**启用中的 id 列表**，
喂给 `Sr` 得到七个百分比，画在 recharts 的 `LineChart` 里。
四张累计卡（`.scratch/index-VUOSJfWA.js:684928`）读的是
`masteredChars.length` / `masteredPoems.length` / `currentStage` / `reading.totalMinutes`。

兑换审批是三个 store action：

```js
// .scratch/index-VUOSJfWA.js:277716 —— 申请：不扣勋章，只落一条 pending
requestExchange: n => { … if (e.currency.medals < t.medalCost) { e.toast = `勋章还不够哦`; return }
  e.exchangeRecords.unshift({ id: gr(), rewardId: t.id, rewardName: t.name,
    medalCost: t.medalCost, status: `pending`, requestedAt: new Date().toISOString() }) }
// .scratch/index-VUOSJfWA.js:278086 —— 批准：这里才扣
approveExchange: n => { let t = …find(e => e.id === n && e.status === `pending`);
  !t || e.currency.medals < t.medalCost ||
  (e.currency.medals -= t.medalCost, t.status = `approved`, t.resolvedAt = …) }
// .scratch/index-VUOSJfWA.js:278314 —— 驳回：不看状态、不退款
rejectExchange: n => { let t = …find(e => e.id === n);
  t && (t.status = `rejected`, t.resolvedAt = new Date().toISOString()) }
```

**线上是「批准时扣」，本仓库 P3-b 已经改成「申请即扣」**（`reward/doc.md`）——
这一处差异决定了第三段的驳回要不要退款，见下文。

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

**第三段又找出七项**，全在看板、报告与审批上：

11. **「本周」在线上有三个互不相同的定义，界面上都叫「本周」。**
    `jr`（`.scratch/index-VUOSJfWA.js:244994`）数的是「核心 8 项里完成 ≥ 5 项」的天数，
    周奖励用它；看板那个 `f`（`.scratch/index-VUOSJfWA.js:684151`）数的是
    「任意一项完成」的天数，页面上写着「本周打卡 N 天」；
    `Br`（`.scratch/index-VUOSJfWA.js:246964`）数的是
    「自律 + 学习完成 ≥ `ceil(总数 × 0.6)`」的天数 ≥ 5，`full-week` 成就用它。
    同一周同一份数据，三个数可以是 `2` / `7` / `false` —— 家长看到「本周打卡 7 天」
    却没拿到周奖励，界面上无从解释。本仓库只有一个 `isQualifiedDay`
    （P3-b 已经收拢，见 `reward/doc.md`），**看板必须复用它**，
    这一条的处置在第三段是「不新造第四个口径」。
12. **`dailyGoal` 的分母是全部启用任务，而达标线是家长填的一个数。**
    `u = tasks.filter(e => e.enabled).length` 数的是 18 条里启用的全部
    （含学习五条、健康四条），而 `dailyGoal` 默认 `6`。两个数不是同一件事的两端：
    18 条全启用时「完成 6 项」可以是「六条自律、一条学习都没做」。
    看板同时显示 `d / dailyGoal` 与那个 `u`，家长要自己想清楚哪个是分母。
13. **打卡日历用「今天的启用任务数」当每一天的分母。**
    `.scratch/index-VUOSJfWA.js:688071` 那个 `i = u` 是循环外算的一个常数 ——
    周一的完成数除以今天的启用数。家长上周五启用了三条新任务，
    整周的柱子会一起变矮；而**完全没有记录的那几天分母也是 `u`**，
    显示成 `0/18` 而不是「没有数据」。
14. **报告的「已完成」与「未完成」不构成划分。**
    `u = t.filter(e => c?.completedTasks[e.id]?.completed)`（**不过滤 `enabled`**）
    对 `d = t.filter(e => e.enabled && !c?.…)`（**过滤 `enabled`**），
    见 `.scratch/index-VUOSJfWA.js:695875`。停用的任务今天打过卡会出现在「已完成」里，
    而它在「未完成」里不出现 —— 两个列表加起来既可能多于也可能少于任务总数。
    而且「未完成」还 `.slice(0, 8)`（`.scratch/index-VUOSJfWA.js:697375`），
    截断没有任何提示。
15. **报告的叙述句里写死了一个任务 id，而那句话说的事情与 id 不符。**
    `c?.completedTasks['brush-am']?.completed && _.push('今天完成了早晚刷牙。')`
    （`.scratch/index-VUOSJfWA.js:695875`）—— 只看早上那条就说「早晚」都刷了。
    本仓库同样有 `brush-am`（早上刷牙）与 `brush-pm`（晚上刷牙）两条独立任务
    （`data/defaultHabits.js`），照抄这一句会在报告里说一件没发生的事。
16. **报告的「阅读」累计读的是一个永不递增的字段。**
    `reading.totalMinutes` 全仓只出现三次：初始化 `0`
    （`.scratch/index-VUOSJfWA.js:242505`）、孩子侧的学习入口卡
    （`:636042`）、看板那张累计卡（`:684928`）—— **没有任何一处 `+=`**。
    那个「📖 阅读 0 分钟」是个永远的 `0`。与 P5 数学 `math_games`
    读了一个两边都不存在的字段名同型（`math/doc.md`）：
    **「进度恒 0」既可能是「还没有数据」也可能是「没人写它」，观测结果一样。**
17. **`rejectExchange` 不看状态、不退勋章；`approveExchange` 勋章不够时静默什么都不做。**
    `.scratch/index-VUOSJfWA.js:278314` 那个 `find(e => e.id === n)` 后面没有
    `&& e.status === 'pending'` —— 一条已经 `approved`（勋章已扣）的记录还能再被驳回，
    状态变成 `rejected` 而勋章不回来。`:278086` 的
    `!t || e.currency.medals < t.medalCost || (…)` 那一支在勋章不够时**连 toast 都没有**，
    家长点了「确认」，界面上什么都不发生。
    而 `bB()`（`.scratch/index-VUOSJfWA.js:689463`）在没有 pending 时 `return null` ——
    待审批卡整块消失，且它只在 `/parent` 的最下面：
    孩子申请之后，那条申请在应用里没有第二个地方能看到。

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

| 页面                  | 内容                                                    |
| --------------------- | ------------------------------------------------------- |
| `pages/parent/parent` | PIN 验证蒙层 → 通过后是家长首页                         |
| — 设置段              | 昵称 / PIN / 每日目标 / 备注（第一段）                  |
| — 任务段              | 18 条任务的启用与编辑 + 新增 + 兑换卡启用（**第二段**） |
| — 数据段              | 导出 / 导入 / 清空（第一段）                            |
| `pages/board/board`   | 看板 + 每日报告（**第三段**，只读，进去前再验一次 PIN） |
| — 兑换审批            | 留在 `parent` 的任务段（**第三段**，它是写入口）        |

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

### 三处偏离线上（第三段）

**1. 「本周」只有一个定义，看板复用 `isQualifiedDay`。** 线上三个口径同叫「本周」
（缺陷 11）。本仓库 P3-b 已经把达标日收拢成一个函数，第三段的看板**不新造第四个** ——
它显示的「本周达标 N 天」与周奖励发不发是同一个数，家长看到 `4/5` 就知道还差一天。
代价是看板上那个数比线上的小（线上数「任意一项完成」的天数，几乎每天都算）——
一个诚实的小数字比一个好看的大数字有用。

**2. 「不知道」显示成「不知道」，不显示成 0。** 打卡日历那一格（缺陷 13）线上用
「今天启用中的任务数」当每一天的分母，包括完全没有记录的那几天，显示成 `0/18`。
**本仓库的分母同样只能是今天那个数** —— 存档里没有「上周三有哪些任务启用着」这笔数据，
而这不是遗漏，是那笔数据从来没被记过（要记就得给每次启用/停用落一条时间戳，
那是一份新的水位）。所以处置不在分母上，在显示上：`boardState` 给每天一个
`hasRecord`，没有记录的那天页面显示「—」。**近似值要标出来它是近似值**，
分母这一条在文档里说明一次（`AGENTS.md` 第 5 节第 7 条的同一条精神：不臆造数据）。

**3. 驳回退回勋章，退款走 `postLedger`。** 线上 `rejectExchange` 不看状态、不退款
（缺陷 17），而线上**申请时不扣勋章**，所以「不退」在那边是自洽的。
本仓库 P3-b 改成了**申请即扣**（`reward/doc.md`），驳回不退等于孩子点错一次就白掉
两枚勋章 —— 与「什么算好」第 2 条（温和，不惩罚）相反。所以第三段给
`redemptions.status` 加第三个取值 `'cancelled'`（`SAVE-24`），驳回时：

```js
// 退款不是 { ...save, currency } —— point.js::postLedger 的头注释写着
// 「save.currency 只可能被 point.js 改，而它每次改都追加一条流水」
postLedger(
  next,
  key,
  'earn',
  { star: 0, gem: 0, petFood: 0, medal: record.medalCost },
  `退回：${record.name}`,
  now,
);
```

**退款落在驳回那一天的流水里，不是申请那一天。** 流水回答的是「那天发生了什么」，
而退款发生在今天。所以 `key` 是入参（页面给 `dayKey(now)`，`utils/` 不读时钟）。

**同一个 `'cancelled'` 有两种来历，所以文案是「已取消」不是「已退回」。**
驳回产生的那些退了勋章，而 `IMPORT-12` 从线上映射来的 `rejected` 记录
**从来没被扣过勋章**（线上批准时才扣）—— 导入不退款，也无款可退。
一个状态两种来历，文案只能说两边都成立的那件事。

### `utils/parentReport.js`：两个纯读函数，一个写盘动作都没有

```js
boardState(save, now)        -> { today, week, trends, totals }
dailyReport(save, key)       -> { key, done, goal, met, doneList, todoList, learning, sentences, currency, pet }
```

**第三段新增的模块一个写函数都没有**，六个写入口仍然全在 `parentTasks.js` 里
（第二段五个 + 本轮的 `resolveRedemption`）。这是第二段「读排列 / 写重排」那条纪律
在**文件粒度**上的一次执行：拆模块的判据不是「碰哪个字段」（三个函数都碰 `days` 与
`redemptions`），是「它写不写盘」。代价是 `parentTasks.js` 从此名不副实 ——
它其实是「家长域的写入口」。**不改名**：改名要动两处 import、一个测试文件与三份
`doc.md`，换来的只是一个更准的词；这笔债记在这里。

`boardState` 的形状：

```js
{
  today: { key, done, goal, met, total },   // done 只数启用中的，与 dailyReport.doneList 同源
  week: {
    days: [{ key, weekday, done, total, hasRecord, qualified, today }],  // 周一到周日七条
    qualifiedDays: 3, minDays: 5, bonusDone: false,
  },
  trends: { habit: [0, 33, 100, …], learning: […], health: […] },        // 各七个整数，百分比
  totals: { charsLearned: 30, charsMastered: 7, poems: 2, stage: 3, readMinutes: 120, days: 12 },
}
```

**`done` 的口径只有一个，而它不是 `dayProgress`。** `habit.js::dayProgress` 数的是
首页九格（`category === 'habit'` 且启用），看板与报告要的是**三类合计**。
两个口径不同，所以是两个函数、两个名字 —— 但**都由 utils 给**，页面一个都不自己数。
`total` 是启用中的任务总数，`goal` 是 `dailyGoal`：线上把这两个数并排显示却不说它们
不是同一件事的两端（缺陷 12），本仓库两个数都给，**页面上写「完成 5 项 · 目标 6 项（共 18 项）」**
—— 括号里那个数说明「目标」不是「全部」。

**趋势是三条 × 七个整数，不引图表库。** 每天的值是
`round(该类启用中完成的条数 / 该类启用中的条数 × 100)`，该类一条都没启用时落 `0`
（照线上 `Sr`，`.scratch/index-VUOSJfWA.js:244157`）。线上用 recharts 画折线，
本仓库零运行时依赖，**画七根 WXSS 柱子**：折线要么上 canvas（要测量、要处理 dpr）、
要么内联 SVG（小程序不支持），而柱子是七个 `<view>` 加一个百分比高度。
折线的信息在「七天的形状」上，柱子一样能看出来。

**第四张累计卡换掉了线上那个死字段。** 线上四格是
`masteredChars.length` / `masteredPoems.length` / `currentStage` / `reading.totalMinutes`，
而最后那个恒为 `0`（缺陷 16）。本仓库改成**遍历 `days` 现算的累计阅读分钟**
（`learning.reading.minutes` 求和）—— **不落盘一个累计字段**：那种字段会与 `days`
分叉，而这里连「余额」都不需要（与「流水是账、货币是余额」同一条判断的反面：
没有余额语义的东西不存水位）。代价是 O(天数)，看板一天看一次，可以接受。

**识字给两个数（学过 / 已掌握），不只给「已掌握」。** 本仓库的掌握要熬完六个间隔、
跨 58 天（`literacy/doc.md`），头两个月只显示「已掌握 0 字」会让家长以为识字没在动 ——
`chars_learned` 成就当初也是为这件事改成数「学过」的（`ACHV-05`）。

### `dailyReport(save, key)`：两张列表构成划分，那个数就是列表的长度

线上「已完成」不过滤 `enabled` 而「未完成」过滤（缺陷 14），两张表加起来既可能多于
也可能少于任务总数；而顶上那个「完成 N 项」是**第三次数**
（`Object.values(completedTasks).filter(completed).length`），与两张表都不同源。

本仓库三个数一个来源：

```js
const enabled = habits.filter((item) => item.enabled); // 三类合计
const doneList = enabled.filter((item) => item.id in checks);
const todoList = enabled.filter((item) => !(item.id in checks));
const done = doneList.length; // 不另数一次
```

**`todoList` 不截断。** 线上 `.slice(0, 8)` 且不提示（`.scratch/index-VUOSJfWA.js:697375`），
而本仓库任务总数 18 条、页面能滚。

**停用的任务今天打过卡，两张列表都不含它**，`done` 也不含它 —— 与看板的 `today.done`
是同一个口径（`PARENT-55` / `PARENT-65` 两条各钉一处，少了后者，
一个只在看板上过滤 `enabled` 的实现也能全绿）。那条打卡记录仍在存档里，
家长把任务开回来它就回来了（软删除的同一条）。

**叙述句在 utils 里拼，且一个任务 id 都不写死。** 线上那句
`completedTasks['brush-am'] && push('今天完成了早晚刷牙。')`（缺陷 15）只看早上那条
就说「早晚」都刷了 —— 本仓库 `brush-am`（早上刷牙）与 `brush-pm`（晚上刷牙）
是两条独立任务，照抄会在报告里说一件没发生的事。三条规则都从数据来：

| 条件                          | 句子                                                |
| ----------------------------- | --------------------------------------------------- |
| `doneList` 非空               | 「今天完成了 N 项：起床、刷牙、……」（名字来自数据） |
| 当天 `literacy.newChars` 非空 | 「识字学了「天」「地」。」                          |
| 一条都没有                    | 「今天还没有完成记录，明天一起加油！」              |

**不做线上那句「建议明天继续复习昨天学习的汉字」** —— 它的触发条件与上一句完全相同
（`newChars.length` 判了两次），是一句读了同一份数据却装作有建议的模板。
句子放在 utils 而不是页面，与 `coreWarn` / `statusText` 同一条：
**页面不选文案里的事实**，它只负责换行。

### `resolveRedemption(save, key, at, action, now)`：一个函数两个动作

```js
resolveRedemption(save, key, at, 'done')       -> save   // pending → done，货币一分不动
resolveRedemption(save, key, at, 'cancelled')  -> save   // pending → cancelled，退回 medalCost
```

**`'done'` 不动货币**，因为申请那一刻 `redeem` 已经 `postLedger('spend')` 扣过了
（`reward/doc.md`）。所以确认是一次纯粹的状态迁移 —— 家长端的这个按钮回答的是
「东西给了没有」，不是「钱付了没有」。

**两个动作一个函数**，因为它们共用三件事：找到那条记录、状态必须是 `'pending'`、
只改一条。线上分成 `approveExchange` / `rejectExchange` 两个，而其中一个
**漏了状态检查**（缺陷 17）—— 已经批过、勋章已扣的记录还能再被驳回，
状态变成 `rejected` 而勋章不回来。**一个入口比两个入口各查一次可靠**，
与第一段「改 PIN 只剩 `saveSettings` 一个入口」同一条。

**记录的身份是 `at`，不是数组下标。** `redemptions` 的元素没有 id
（与流水同一条，`redemptionsFromOnline` 连线上那个 `id` 都不接），
而下标会因为「列表渲染之后又多了一条」指向另一条 ——
兑换是孩子在别的页面点出来的，那段时间里列表可以变（与第一段「粘贴框一改就把预览作废」
同一类接缝）。`at` 是毫秒时间戳，同一毫秒两条要在 1ms 内点两次。

三种错误策略各有理由：

| 情况                         | 行为                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `at` 找不到                  | `RangeError` —— 按钮是读取入口渲染出来的，传别的值只可能是代码写错                                 |
| `action` 不是那两个值        | `RangeError` —— 页面只有两个按钮                                                                   |
| `now` 非有限数               | `TypeError`（`AGENTS.md` 第 5 节第 6 条）                                                          |
| 那条记录已经不是 `'pending'` | **原样返回入参**，不抛错 —— 家长在两处各点一下是竞态，不是编程错误（与 `redeem` 遇到停用卡同一条） |

**待兑现列表进 `parentTasks(save)` 的 `pending` 字段**，与那三张兑换卡并列：
卡是「能换什么」，`pending` 是「换了还没给」，同一件事的两半，
所以在同一段（任务段）里也在同一个读取入口里。**空列表是 `[]` 不是 `null`**，
页面在没有待兑现时显示一句「没有待兑现的兑换」—— 线上 `bB()` 空时
`return null`，整块卡片消失（缺陷 17 第三处），而它是全应用里唯一能看到那条申请的地方。

### 导入线上 `dailyRecords`：全仓最后一份没接的线上数据

`days` 从 P1 起就是 `days: onlineJson.dailyRecords` 整份透传（`IMPORT-04` 写着「原样」），
第二段把它列进范围外并写明「第三段的看板要读 `days`，那时再接」。**本轮接完**，
`IMPORT-04` 的「原样」因此改成「日期键原样，值逐键映射」。
逐键规则与恒等映射的清单在 `docs/features/storage/doc.md`（`IMPORT-19` ~ `21`），
这里只记三个判断：

**墓碑不算打过卡，而键也不留。** 线上取消打卡写
`completedTasks[id] = { completed: false }`（`.scratch/index-VUOSJfWA.js:272460`
那一支），本仓库 `uncheck` 删键 —— `HABIT` 区的不变式是「键存在即已打卡」。
所以 `completed !== true` 的元素**不写进 `checks`**。留一个 `{ at: 0 }` 会让
`isChecked` 说打过、让 `dayProgress` 多数一件事，而它记录的恰恰是「取消了」。

**`ledger` 的四个货币一律补 `0`。** 线上 `br`（`.scratch/index-VUOSJfWA.js:243866`）
写的是 `{ stars, foodPoints, gems, medals }` 四个键，而调用方
（`Do` / `Oo`，`:270380` / `:270496`）多数只传前两个 —— 大部分流水行的
`gems` / `medals` 是 `undefined`。搬过来不补 `0`，`dayEarned` 那类求和会变 `NaN`，
而 `NaN` 在界面上显示成「NaN⭐」且不会抛错。**顺带丢掉元素的 `id`**：
本仓库的流水没有 id（`postLedger` 头注释：「它不按 id 查，数组下标就是它的身份」）。

**`learning` 的三个子键各丢一样东西，理由都不是「用不上」。**
`reading` / `english` 丢 `completed`：**完成状态只能有一个真相**，那就是 `checks`
（`learning.js::isDone` 的头注释已经写下这条）；两处记录同一件事，
迟早有一处对不上。`reading` 还丢 `coverDataUrl` —— 它是一整张 base64 图片
（`.scratch/index-VUOSJfWA.js:663518`），小程序单个 storage key 上限 1MB、
整体 10MB，几十天的封面就能把存档撑爆，而它在本仓库没有任何显示位置。
`literacy` 丢 `mastered`：本仓库的「已掌握」从
`learningProgress.literacy.chars[字].step` 现算（`step >= 7`），
存一份当天的快照就是第二个真相。

**四条成就的进度会被这份映射改变，所以它是一次有后果的改动。**
`utils/reward.js` 的 `JUDGES` 里恰好四条读 `days` 的内部：
`reading_days` 读 `day.learning?.reading !== undefined`、
`veggie_week` 读 `'vegetables' in checks`、`room_tidy` 读 `'room' in (day.checks ?? {})`、
`daily_all_done` 读 `day.bonuses?.allDone === true`。所以「墓碑不写键」
「`learning.reading` 的形状」「`dailyAllDone` → `allDone` 改名」这三条
各自都在动成就进度 —— 在此之前 `days` 是原样透传的线上形状，
这四条对导入来的存档**一条都数不出来**（`checks` 这个键根本不存在，
线上叫 `completedTasks`）。一条规格专门断言这件事（`IMPORT-19`）。

### 页面：拆一个只读的看板，代价是两次 PIN

`parent.js` 第二段收尾时 497 行，是全仓最大的页面，拆点在那时就定了：**拆看板**。
判据不是行数，是**只读性** —— 看板与报告一个字都不写盘，做成「从家长首页跳过去、
进去前再验一次 PIN」不别扭（一天看一次，多输四个数字可以接受）；
而任务段不行，改完要立刻看到结果，中间插一次验证会让「改错了再改回来」变成噩梦。

**`pages/board/` 是第 12 个 page，`app.json` 不加第五个 tab。** 与
`pages/parent/` 同一条：家长的东西不进 tabBar（孩子会点）。没有 `components/` 目录，
所以「抽个组件」不是选项 —— 本仓库至今零自定义组件，为看板开这个头不值得。

**看板页自己有一层 PIN 蒙层，代码与 `parent.js` 那一层同形但不共用。**
共用要抽一个 `behavior` 或一个渲染 helper，而两处的差别（验过之后显示什么）
恰好是全部内容。**重复的是那 20 行蒙层**，抽出来省不到 20 行、多一个抽象。
这笔重复记在这里，第三处出现时再抽（本轮之后家长端不会有第三个页面）。

看板一页两段，`tab` 字段切换（与 `parent.js` 同形）：

| 段     | 内容                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| 看板段 | 今日四个数 + 本周七格日历 + 三条七日趋势柱 + 四格累计                        |
| 报告段 | 选一天（默认今天）→ 叙述句 + ✅ 已完成 / ⏳ 未完成 / 📚 学习 / 🎁 奖励与宠物 |

**报告能翻到前几天，选日期用的是 `week.days` 那七个键**，不开 `picker`：
`wx.datePicker` 能选到没有记录的任意一天，而看板已经把这一周摊开了 ——
点日历里那一格就是「看那天的报告」。**没有记录的那几格点不动**（`hasRecord` 为 `false`），
因为一份空报告说不出任何事。

**审批留在 `parent` 的任务段，与三张兑换卡并列。** 它是写入口，而看板页是只读的 ——
把一个写按钮放进只读页面，「进去前验一次就够」这个前提就没了
（只读页面看错了没有后果，写错了有）。待兑现每条两个按钮：
「✅ 已给她了」走 `'done'`，「↩️ 退回勋章」走 `'cancelled'`，
后者 `wx.showModal` 二次确认（它动货币，前者不动）。

**`parent.js` 因此只长约 60 行**（待兑现列表 + 两个按钮 + 一个入口按钮），
看板那 300 多行落在新页面里。

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

### 看板、每日报告与兑换审批（`PARENT`，第三段）

`miniprogram/utils/parentReport.js` 的两个读函数，加 `parentTasks.js` 的
`resolveRedemption` 与 `parentTasks` 的一个新字段。

| Spec ID   | 输入                                                                  | 期望输出                                                                                                                 |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| PARENT-54 | 空存档 `boardState(save, NOW)`                                        | `today.done` 为 `0`、`goal` 为 `6`、`met` 为 `false`、`total` 为 `18`；`week.days` 七条；`trends` 三条各七个 `0`         |
| PARENT-55 | 当天打了 5 条，其中一条任务已停用                                     | `today.done` 为 `4`（停用的不数）、`total` 为启用中的条数（`17`）—— 与 `PARENT-65` 同一个口径                            |
| PARENT-56 | `dailyGoal` 为 `4` 且当天完成 4 条                                    | `today.met` 为 `true`；`goal` 与 `total` 是**两个数**（缺陷 12：线上把它们当同一件事的两端）                             |
| PARENT-57 | `boardState` 的 `week.days`                                           | 七条，键与 `weekKeys(now)` 逐个相等（周一到周日），`today` 只在今天那条为 `true`                                         |
| PARENT-58 | 只有今天有记录的存档                                                  | 今天那条 `hasRecord` 为 `true`，另六条为 `false`（缺陷 13：不显示成 `0/18`，页面显示「—」）                              |
| PARENT-59 | 三天核心项打满 5 条、两天只打 2 条                                    | `week.qualifiedDays` 为 `3`（复用 `isQualifiedDay`，不新造第四个「本周」口径）、`minDays` 为 `5`、`bonusDone` 为 `false` |
| PARENT-60 | 某天 `habit` 类启用 9 条完成 3 条、`health` 类一条都没启用            | 那天 `trends.habit` 为 `33`（四舍五入）、`trends.health` 为 `0`（一条都没启用时落 `0`，照线上 `Sr`）                     |
| PARENT-61 | `boardState` 的 `trends`                                              | 三条数组长度都是 `7`，下标与 `week.days` 一一对应（页面按下标配对画柱子）                                                |
| PARENT-62 | 30 个字学过、其中 7 个 `step >= 7`                                    | `totals.charsLearned` 为 `30`、`charsMastered` 为 `7` —— **两个数都给**（头两个月「已掌握」是 0）                        |
| PARENT-63 | 三天各读 20 / 30 / 40 分钟                                            | `totals.readMinutes` 为 `90`（遍历 `days` 现算，存档里没有累计字段 —— 缺陷 16 是个恒为 0 的死字段）                      |
| PARENT-64 | 空的一天 `dailyReport(save, key)`                                     | `done` 为 `0`、`doneList` 为 `[]`、`todoList` 为全部启用任务、`sentences` 只有「今天还没有完成记录……」那一句             |
| PARENT-65 | 当天打了 3 条，其中一条任务已停用                                     | `doneList` 两条、`done` 为 `2`；那条停用任务**两张列表都不含它**（存档里的打卡记录仍在）                                 |
| PARENT-66 | 任意一天的 `dailyReport`                                              | `doneList.length + todoList.length` 恒等于启用任务数，`done === doneList.length`（三个数一个来源，缺陷 14）              |
| PARENT-67 | 18 条全启用、一条都没完成                                             | `todoList` 18 条（**不截断** —— 线上 `.slice(0, 8)` 且不提示）                                                           |
| PARENT-68 | 完成了 `brush-am` 但没完成 `brush-pm`                                 | 句子里只出现「早上刷牙」，不出现「早晚」（缺陷 15：线上写死 `brush-am` 却说「早晚刷牙」）                                |
| PARENT-69 | 当天 `literacy.newChars` 为 `['天', '地']`                            | `sentences` 多一句「识字学了「天」「地」。」；`learning` 里五个子键各按当天记录给（没有的子键不出现）                    |
| PARENT-70 | 当天有两条流水、宠物等级 3                                            | `currency` 是当天的净收支（走 `dayEarned`，不重算）、`pet` 是等级与心情的快照                                            |
| PARENT-71 | `dailyReport(save, '2020-01-01')`（`days` 里没有这个键）              | 不抛错，等同「空的一天」（页面禁止点没有记录的格子，但读函数照 `AGENTS.md` 第 5 节第 6 条只对**非法**入参抛错）          |
| PARENT-72 | `resolveRedemption(save, key, at, 'done', NOW)`                       | 那条记录 `status` 为 `'done'`；`currency` 一分不动、当天流水**不加行**（申请时已扣）                                     |
| PARENT-73 | `resolveRedemption(save, key, at, 'cancelled', NOW)`（`medalCost` 3） | `status` 为 `'cancelled'`；`currency.medal` 加 `3`，当天流水多一条 `earn`（退款走 `postLedger`，不直接改 `currency`）    |
| PARENT-74 | 对一条已经是 `'done'` 的记录再 `resolveRedemption`                    | **原样返回入参**（对象同一性）—— 家长在两处各点一下是竞态，不是编程错误（与 `redeem` 遇到停用卡同一条）                  |
| PARENT-75 | `at` 在 `redemptions` 里找不到                                        | 抛 `RangeError`（按钮的 `at` 全部来自 `parentTasks` 的输出）                                                             |
| PARENT-76 | `action` 不是 `'done'` / `'cancelled'`；或 `now` 非有限数             | 前者抛 `RangeError`（页面只有两个按钮），后者抛 `TypeError`（退款要用它落流水）                                          |
| PARENT-77 | 三条记录（`pending` / `done` / `cancelled`）上 `parentTasks(save)`    | `pending` 只有第一条；三条都 `done` 时 `pending` 为 `[]`（**不是 `null`** —— 线上空时整块卡片消失，缺陷 17 第三处）      |

### 第三段追加到存储层与 `REWARD` 区的规格

线上 `dailyRecords` 的逐键映射（`IMPORT-19` ~ `21`）与 `redemptions.status` 的第三个
取值（`SAVE-24`）声明在 `docs/features/storage/doc.md`；`'cancelled'` 的状态文案
（`REWARD-18`）声明在 `docs/features/reward/doc.md`。分工与前两段同一条。

`PARENT-55` / `PARENT-65` 看着重复，钉的是**同一个口径的两个读取入口**：
看板的今日格与报告的两张列表都要「只数启用中的」，而它们是两个函数
（`boardState` 数三类合计的数，`dailyReport` 给两张名单）。少了 `PARENT-65`，
一个只在看板上过滤 `enabled`、报告里照 `checks` 的键数的实现也能全绿 ——
而那正是线上缺陷 14 的形状。

`PARENT-66` 是一条**不带具体数字**的规格：它断言的是「两张列表构成划分」这个不变式，
所以造的存档要有停用的任务、有停用任务的打卡记录、有未完成项。
线上三个数三处各数一次，任意两处的口径不同都能得出「看着对」的界面。

`PARENT-56` 必须与 `PARENT-54` 一起看：`PARENT-54` 里 `goal`（6）与 `total`（18）
恰好都不等于 `done`，而 `PARENT-56` 造的是 `goal < total` 且完成数正好等于 `goal` 的
那一天 —— 一个把 `met` 写成 `done >= total` 的实现能过 `PARENT-54`（都是 `false`）
但过不了 `PARENT-56`。

`PARENT-58` 与 `PARENT-60` 是两种不同的「零」：没有记录（`hasRecord` 为 `false`，
显示「—」）与真的一条没完成（`0%`，显示一根空柱子）。少了 `PARENT-58`，
一个把两者都返回 `0` 的实现全绿，而那就是缺陷 13。

`PARENT-72` / `PARENT-73` 是一对，钉的是「两个动作只有一个动货币」：
少了 `PARENT-72`，一个两条路径都退款的实现能过 `PARENT-73`；
少了 `PARENT-73`，一个两条路径都不退款的实现能过 `PARENT-72`（就是线上缺陷 17）。
`PARENT-73` 同时断言流水多了一行 —— 只断言 `currency.medal` 变了会让
「直接改 `currency` 不走 `postLedger`」这个实现全绿，而那会破掉
`point.js` 头注释里那条不变式（「`save.currency` 只可能被 `point.js` 改，
而它每次改都追加一条流水」）。

`PARENT-74` 断言对象同一性，是家长端写入约定第三条的第三次出现
（`PARENT-15` / `PARENT-39` / `PARENT-47` 之后）。

## 范围外

- ~~**不做任务管理。**~~ 第二段做了：`utils/parentTasks.js` 的
  `saveHabit` / `addHabit` / `moveHabit`（`PARENT-24` ~ `50`），
  `habit/doc.md` 那条「写入路径在 `PARENT`（P7）」的预告到此兑现。
  但 **`needsParentConfirm` 仍然不给入口** —— 它在全仓零读取点，
  给一个改了不生效的开关比不给更糟；**第三段把它从「以后」变成了「不做」**（见下）。
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
- ~~**不做导入 `days`（线上 `dailyRecords`）的内部结构。**~~ 第三段做了
  （`IMPORT-19` ~ `21`）：墓碑不写键、ISO 转毫秒、`learning` / `health` / `ledger`
  三个兄弟键各自映射。第二段之后那句「导入来的任务定义生效了，历史打卡记录仍是原样
  透传的线上形状」到此不再成立 —— **全仓最后一份没接的线上数据接上了**，
  `importOnline.js` 里剩下的三个「不接」是永久不接（理由写在 `storage/doc.md`）。
- ~~**不做看板、每日报告、兑换审批。**~~ 第三段做了：`utils/parentReport.js` 的
  `boardState` / `dailyReport`（`PARENT-54` ~ `71`）与 `parentTasks.js` 的
  `resolveRedemption`（`PARENT-72` ~ `77`）。`redemptions` 从此有第三个状态
  `'cancelled'`（`SAVE-24` / `REWARD-18`），驳回**退回勋章**（线上不退，
  因为线上批准时才扣；本仓库 P3-b 改成了申请即扣）。
- **不做 `needsParentConfirm` 的入口 —— 它保持全仓零读取点。** 第二段把它列在
  「读取路径在第三段（兑换审批）」，本轮到了跟前却**不做**：它要的是
  「打卡也要家长审」这条流程，而兑换审批做完之后能看清那是另一件事 ——
  兑换是孩子主动申请、家长事后兑现（异步、不阻塞孩子）；打卡审批会让
  孩子点完打卡看不到星光，直到家长打开家长端为止，与「什么算好」第 1 条
  （即时正反馈）和第 3 条（孩子能独立完成一次互动）都相反。
  **这条从「以后再做」变成「结论」**：`habit/doc.md` 那句预告要改写。
- **不做改历史。** 报告只读那一天的记录，没有「补打昨天的卡」「删掉一条流水」的入口。
  补打要回答「昨天补的卡今天发不发星光、算不算昨天的达标日」，而那会让
  「流水是那天发生了什么」这条口径失效（退款落在驳回那天而不是申请那天，
  正是同一条判断的正面用法）。
- **不做导出报告（图片 / 文字分享）。** 单一家庭自用，愿景「明确不做」里
  没有分享传播；`wx.setClipboardData` 已经能复制整份存档。
- **不做周报 / 月报。** 看板已经是「本周」的粒度，月报要先有一张跨月的日历，
  而它的问题与日报不同（日报回答「今天做了什么」，月报回答「这个月的趋势」）。
  七日趋势是本轮给的答案，够用之后再说。
- **不做趋势图的折线 / canvas。** 三条七个整数用 WXSS 柱子画。折线要么上 canvas
  （要测量、要处理 dpr），要么内联 SVG（小程序不支持），而折线的信息在
  「七天的形状」上，柱子一样看得出来。线上那份 recharts 依赖迁不过来
  （本仓库运行时零依赖）。
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
