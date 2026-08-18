# 家长端第一段（PIN 长按入口 + 家长设置 + 数据搬迁）· 实施清单

顺序按依赖：先补存储层（`parent` 两个新字段的默认值与收敛、`dailyGoal` 上界、导入映射），
再术语与既有文档，再纯函数与测试，最后页面与首页那个长按。
`parent.js` 只 import `dayKey.js` 与 `save.js`；
**`parent.js` 不 import `importOnline.js`**（两者没有共同判断，页面各调一个）。

## 1. 存储层先行（`AGENTS.md` 第 5 节第 2 条）

- [x] `docs/features/storage/doc.md`：存档结构块里 `parent` 补两个字段，
      加「PIN 的两个水位」一节、`SAVE-19` / `IMPORT-16`，并改映射表那三行
      （`parentSettings` 的三个字段之后补一行「—（线上没有）」）
- [x] `miniprogram/utils/save.js`：`parent` 加 `pinFails`（夹 `0`~`5`）与
      `pinLockedUntil`（非负整数），`dailyGoal` 上界从 `noMax` 改成 `12`
- [x] `defaultSave()` 里 `parent` 补 `pinFails: 0, pinLockedUntil: 0`
- [x] 加两个常量（`PIN_MAX_FAILS = 5` / `DAILY_GOAL_MAX = 12`），
      头注释写清「`pinFails` 是水位不是设置项，夹住只是不让脏存档撑大数字」
- [x] `miniprogram/utils/importOnline.js`：`PARENT_MAP` 不动（两个新字段不接），
      在头注释里写明「线上没有节流，导入落默认值 —— 与 `pet.lastFedAt` 同一条」
- [x] `tests/save.test.js` 补 `SAVE-19`
- [x] `tests/importOnline.test.js` 补 `IMPORT-16`，并改 `parent` 那条断言的期望值

## 2. 术语与既有文档

- [x] `docs/glossary.md`：`pinFails` / `pinLockedUntil` 两条补上，
      「家长 PIN」一条写明是明文 4 位数字
- [x] `docs/vision.md`：「待确认」名单里 PIN 那条**去掉标记**，改写成拍板结论
      （明文、忘了只能清空数据、连错 5 次冷却 60 秒）
- [x] `PARENT` 区名早已登记（`glossary.md` 第 181 行），不重复加

## 3. `parent.js` 四个纯函数

- [x] 写 `miniprogram/utils/parent.js`：`parentState` / `verifyPin` /
      `saveSettings` / `exportJson`
- [x] `parentState`：`locked` / `lockedSeconds`（向上取整）/ `failsLeft` 现算，
      `summary` 只数存档上一层数得出的东西（**不 import 任何 `data/`**）
- [x] `verifyPin` 返回 `{ ok, save, reason }` 三元组，`reason` 三取值
      （`null` / `'wrong'` / `'locked'`）；冷却中**不累加、不延长**
- [x] 连错第 5 次时落 `pinLockedUntil = now + 60000`；验对清零两个字段
- [x] `saveSettings` 白名单四个字段（`childName` / `pin` / `dailyGoal` / `note`），
      未登记字段抛 `RangeError`；`pin` 非 4 位数字抛 `RangeError`
- [x] 改 `pin` 时顺带清零两个水位（改了密码不该还在冷却里）
- [x] 无变化时原样返回入参（对象同一性）
- [x] `exportJson` 用 `JSON.stringify(save, null, 2)`，与线上同一形状

## 4. 测试

- [x] 写 `tests/parent.test.js`，覆盖 `PARENT-01` ~ `PARENT-23`
- [x] `PARENT-05` / `PARENT-06` 是偏离线上最要紧的一对：冷却期间不累加
- [x] `PARENT-17` / `PARENT-18` 一起钉导出（少一条就能被蒙过）
- [x] `PARENT-15` 断言对象同一性（`toBe`）
- [x] `PARENT-02` 造一份有 12 天记录 / 30 字 / 3 诗 / 8 题的存档
- [x] 按 `AGENTS.md` 第 13 条：`parentState` 的规格断言读取入口的输出，
      水位类（`pinFails` / `pinLockedUntil`）的规格断言存档里落了什么

## 5. 页面与入口

- [x] `miniprogram/pages/parent/` 四个文件
- [x] PIN 蒙层与家长首页是**同一页面的两个状态**（`unlocked` 是页面字段，不落盘）
- [x] 蒙层：4 位数字输入、错了显示「还能试 N 次」、冷却中显示倒计时并禁用
- [x] 设置段：昵称 / PIN / 每日目标 / 备注四个输入 + 一个保存按钮
- [x] 数据段：导出（`wx.setClipboardData`）/ 导入（粘贴框 + 摘要确认）/
      清空（`wx.showModal`，确认文案是「清空」）
- [x] 导入：`JSON.parse` 与 `importOnlineSave` 各自 `try`，失败给出**具体原因**
      （不是「导入失败」一句话）
- [x] 导入确认弹窗显示摘要「X 天记录 · Y 字 · Z 首 · N 道题」——
      这是覆盖前唯一能区分「粘对了」与「粘了别的」的东西
- [x] `miniprogram/pages/home/home.wxml`：问候语挂
      `bindtouchstart` / `bindtouchend` / `bindtouchcancel`
- [x] `home.js`：1.5 秒的 `setTimeout`（不是轮询），`onUnload` / `onHide` 清 timer
- [x] `app.json` 加 page（不加第五个 tab）

## 6. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对第二三段的影响
- [x] `docs/vision.md`：P7 的状态从「未开始」改成「进行中」，补家长端那一段
- [x] 留档本次 prompt 到 `prompts/runs/`

---

# 家长端第二段（任务管理 + 兑换卡启用）· 实施清单

顺序仍是存储层先行（`AGENTS.md` 第 5 节第 2 条），但这一轮存储层不是「顺带产出」
而是**前置条件**：`habits` 的元素收敛与线上字段映射不做完，家长端改的就是一个
本仓库认不出的数组，而导入来的存档「合法但不生效」。
`parentTasks.js` import `save.js`（拿 `clampInt` 那几个夹子的同款常量）与
`data/rewards.js`（`toggleReward` 要认 id）；
**不 import `habit.js`**（`listHabits` 过滤 `enabled`，家长端要列全部，需求相反）。

## 1. 存储层先行

- [x] `miniprogram/utils/save.js`：加 `habits` 的元素收敛（`habitEntry`，
      照 `redemptions()` 那个模子），`id` 坏就整条丢掉、重复 id 只留第一条，
      `module` / `weeklyTarget` **条件保留**（不补默认值）
- [x] 加三个模块级常量（`HABIT_CATEGORIES` / `HABIT_FREQUENCIES` /
      `HABIT_REWARD_MAX = 10`），与 `REDEMPTION_STATUS` 同形
- [x] `defaultSave()` 与 `normalizeSave()` 加顶层键 `rewardFlags`（默认 `{}`，
      值收敛成布尔，**未知 id 原样留着**，非对象整份落 `{}`）
- [x] 头注释写清「`habits` 从本轮起收敛，因为它第一次有了写入路径」与
      「`rewardFlags` 缺键 = 启用，所以读取侧一律判 `!== false`」
- [x] `miniprogram/utils/importOnline.js`：`tasks` 从整份透传改成逐元素映射
      （`starsReward` → `starReward`、`foodPointsReward` → `petFoodReward`、
      `subCategory` 不接、`core` 落 `false`）
- [x] `rewardFlags` **整份不接**，在头注释里写明「线上三条卡默认全启用，
      映射恒等于默认值 —— 不接一个没有信息量的映射」
- [x] `tests/save.test.js` 补 `SAVE-20` ~ `SAVE-23`
- [x] `tests/importOnline.test.js` 补 `IMPORT-17` / `IMPORT-18`，
      并改 `IMPORT-01` 那条：`ONLINE_EXPORT.tasks[0]` 现在要断言
      **一个改了名的字段**（`starReward`）与**一个本仓库独有的字段**（`core`），
      只断言 `toHaveLength` 与 `id` 挡不住「元素里每个字段都是错的」

## 2. 术语与既有文档

- [x] `docs/glossary.md`：家长端一节补 `enabled` / `core` / `sortOrder` /
      `rewardFlags` 四条，并写明「停用不是删除」「`core` 是字段不是名单」
- [x] `docs/features/habit/doc.md`：「不做家长端增删改任务」改成划线 + 兑现说明，
      元素块里 `needsParentConfirm` 的注释从「P7 才读」改成「全仓零读取点」
- [x] `docs/features/reward/doc.md`：补 `REWARD-16` / `REWARD-17` 与启用守卫一节，
      订正「`enabled` 是死字段」这句错话，改「不做家长端改奖励项」那条范围外
- [x] `miniprogram/data/rewards.js`：头注释同一处订正（只有 `needsConfirm` 是死字段）
- [x] `docs/features/storage/doc.md`：`habits` 元素收敛与 `rewardFlags` 两节、
      映射表补四行、`SAVE-20` ~ `23` / `IMPORT-17` / `18` 六条、
      「三个永久不接的理由不是同一个」一段

## 3. `parentTasks.js` 五个函数

- [x] 写 `miniprogram/utils/parentTasks.js`：`parentTasks` / `saveHabit` /
      `addHabit` / `moveHabit` / `toggleReward`
- [x] `parentTasks`：列**全部** 18 条（含停用），`editable` / `first` / `last`
      由 utils 算，`coreWarn` 是原因码（`null` / `'none'` / `'few'`），
      阈值读 `POINT` 的 `WEEKLY_BONUS.minDays`，页面不写 `5`
- [x] `rewards` 列**全部三条**（含停用）—— 不复用 `rewardState().items`
- [x] `saveHabit`：白名单四组，未登记字段抛 `RangeError`；`sortOrder` 也抛
      （只能走 `moveHabit`）；`learning` / `health` 两类的 `name` / `icon` 抛
- [x] `saveHabit`：`name` 全空白回落 `'未命名'`（收敛，与 `addHabit` 故意不一致），
      两个产出值夹 `0` ~ `10` 并取整
- [x] `addHabit`：`id` 为 `` `t${now}` ``，撞了追加 `-2` / `-3`；空名字抛 `RangeError`；
      非 `habit` 类抛 `RangeError`；`now` 非有限数抛 `TypeError`
- [x] `moveHabit`：`delta` 只认 `-1` / `1`，边界外返回入参；
      内部 `reindex` 按 `habit` → `learning` → `health` 重排成全局 `1..N`
- [x] `addHabit` 用同一个 `reindex`（段与段永不交叠）
- [x] `toggleReward`：未登记 id 抛 `RangeError`
- [x] 五个函数一律「无变化返回入参」（对象同一性）
- [x] `miniprogram/utils/reward.js`：`rewardState` 过滤 `!== false`、
      `redeem` 停用时**原样返回入参**（不抛错）

## 4. 测试

- [x] 写 `tests/parentTasks.test.js`，覆盖 `PARENT-24` ~ `PARENT-53`
- [x] `tests/reward.test.js` 补 `REWARD-16` / `REWARD-17`
- [x] `PARENT-30` / `PARENT-31` 是一对：少了后者，一个只过滤 `enabled` 的
      `listCore` 也能全绿
- [x] `PARENT-34` / `35` / `36` 三种不同的「不能改」，各挡一个方向
- [x] `PARENT-33` / `PARENT-43` 一起钉「读收敛、写严格」那条不一致
- [x] `PARENT-48` 造一份 `sortOrder` 有重复值的脏存档（线上缺陷 8 的产物）
- [x] `PARENT-53` 挡住「直接复用 `rewardState().items`」这个实现
- [x] `PARENT-39` / `PARENT-47` 断言对象同一性（`toBe`）
- [x] 按 `AGENTS.md` 第 13 条：`parentTasks` 的规格断言读取入口的输出，
      三个写函数的规格断言存档里落了什么

## 5. 页面

- [x] `pages/parent/parent.js`：加 `tab` 字段（设置 / 任务 / 数据三段），
      任务段的数据来自 `parentTasks(this.save)`
- [x] 任务段：18 行，每行图标 + 名字 + 启用开关 + 上移下移 + 展开编辑
- [x] 编辑展开里按 `editable` 决定 `name` / `icon` 是不是只读
- [x] `coreWarn` 为 `'none'` / `'few'` 时任务段顶部一句提示（不是门禁）
- [x] 新增：名字 + 图标两个输入 + 一个按钮，空名字页面就挡住（不让它抛到 utils）
- [x] 编辑产出值时提示「改动从下一次打卡生效，今天已打的卡取消时按新值退」
- [x] 兑换卡三行：图标 + 名字 + `n🏅` + 启用开关
- [x] 每次写入后 `if (next === this.save) return`，再落盘

## 6. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`（追加第二段一节）：实际做法、与 `doc.md` 的偏差、对第三段的影响
- [x] `docs/vision.md`：P7 那一段补第二段的结论（**四处**偏离、四个新缺陷 ——
      本行原写「三处」，`doc.md` 定稿时是四处：软删除 / 只能加 `habit` 类 /
      整段重排 / 只启用停用）
- [x] 留档本次 prompt 到 `prompts/runs/`

---

# 家长端第三段（看板 + 每日报告 + 兑换审批）· 实施清单

顺序仍是存储层先行（`AGENTS.md` 第 5 节第 2 条），而这一轮存储层是**硬前置**：
看板与每日报告读的正是 `days` 的**内部结构**，而 `days` 从 P1 起是
`days: onlineJson.dailyRecords` 整份透传 —— 映射不先做完，一份导入来的存档在看板上
是「合法但一条都读不出来」（`checks` 这个键根本不存在，线上叫 `completedTasks`）。
第二段的 `habits` 是同一个错误形状的第一次（「合法但不生效」），
**规律：整份透传的顶层键，它的规格只会断言到透传的那一层 —— 本轮之后这个数是 `0`。**

`parentReport.js` import `save.js`（拿 `DAILY_GOAL_MAX` 那侧的常量不需要，只要 `days` 的形状约定）、
`dayKey.js`（`weekKeys`）、`point.js`（`isQualifiedDay` / `dayEarned` / `WEEKLY_BONUS.minDays`）；
**不 import `habit.js`**（`dayProgress` 只数首页九格，看板要三类合计，需求相反 ——
与第二段 `parentTasks.js` 不 import `habit.js` 同一条理由）；
**不 import 任何 `data/`**（趋势与累计全从存档现算）。
`resolveRedemption` 加在 `parentTasks.js`（它写盘），import `point.js::postLedger`。

## 1. 存储层先行

- [x] `miniprogram/utils/save.js`：`REDEMPTION_STATUS` 加 `'cancelled'`（`SAVE-24`），
      头注释写明「第三个取值 P7 第三段才有，语义是「退过款了」——
      所以非法值落 `'pending'` 而**不落** `'cancelled'`」
- [x] `miniprogram/utils/importOnline.js`：`days: onlineJson.dailyRecords` 改成
      `daysFromOnline(onlineJson.dailyRecords)`，逐键映射（`IMPORT-19` ~ `21`）
- [x] `daysFromOnline`：`completedTasks` → `checks`，**`completed !== true` 不写键**
      （墓碑不算打过卡）、`completedAt` 走 `toMs`；`date` 不接
- [x] `bonuses.dailyAllDone` → `bonuses.allDone`（改名）
- [x] `ledger[]`：`stars`/`gems`/`foodPoints`/`medals` 走 `CURRENCY_MAP`，
      **四个货币缺的一律补 `0`**（否则 `dayEarned` 求和出 `NaN`、界面显示「NaN⭐」不抛错），
      `at` 走 `toMs`，**元素的 `id` 不接**（本仓库流水按下标是身份）
- [x] `health` **十一个字段名恒等**照搬（全表唯一一个恒等映射）
- [x] `learning` 五子键：`reading`/`english` 丢 `completed`（真相只在 `checks`）、
      `reading` 丢 `coverDataUrl`（base64 图片撑爆 storage）、
      `literacy` 的 `reviewedChars` → `reviewed` 且丢 `mastered`（从 `step >= 7` 现算）、
      `guoxue` `{ poemId }` → `{ poems: [poemId] }`、
      `math` `{ gamesCorrect, stage }` → `{ rounds: [], correct }`
- [x] `redemptionsFromOnline`：`rejected` **不再整条丢掉**，落 `'cancelled'`（`IMPORT-12`），
      去掉那句 `.filter((item) => item.status !== 'rejected')`
- [x] 改 `redemptionsFromOnline` 的头注释：「**`rejected` 整条丢掉** —— 本仓库没有
      「已取消」这个状态」这句**现在是错的**，改写成「落 `'cancelled'`，但**不退款** ——
      线上批准时才扣，那些记录从来没被扣过」
- [x] 头注释里那句「本仓库新加的字段一律不接」的清单不动（`days` 不是新加的字段）
- [x] `tests/save.test.js` 补 `SAVE-24`
- [x] `tests/importOnline.test.js` 补 `IMPORT-19` ~ `21`
- [x] **改 `tests/importOnline.test.js` 的 `IMPORT-04`**：它现在断言
      `expect(result.days['2026-08-10']).toEqual(aug10)`（整份透传），映射之后不成立
- [x] **改端到端那条 `[IMPORT-01]`**：`expect(result.days['2026-08-11'].completedTasks)`
      —— 映射后没有 `completedTasks` 这个键了
- [x] `ONLINE_EXPORT` fixture 里 `completedTasks: { wake: true }` 改成真实形状
      `{ wake: { completed: true, completedAt: '…' } }` ——
      布尔那份 fixture 从来没暴露过墓碑与 ISO 转换

## 2. 术语与既有文档

- [x] `docs/glossary.md`：家长端一节补 `'cancelled'` / `qualified` / `hasRecord` 三条，
      并把「后四条是 P7 第二段登记的」拆成两句（后两个是 `parentReport.js` 的读取输出，
      不是存档字段）
- [x] `docs/features/storage/doc.md`：映射表 `dailyRecords` 一行拆成八行、
      `SAVE-24` / `IMPORT-19` ~ `21` 四条、改 `IMPORT-04` 与 `IMPORT-12` 两行、
      「一个键可以有映射而不收敛」一段、「给一个枚举加取值要去数谁在穷举它」一段
- [x] `docs/features/reward/doc.md`：补 `REWARD-18` 与「第三个状态」一节，
      划掉「不做家长审批与驳回」「不做撤销兑换」两条范围外
- [x] `docs/features/habit/doc.md`：`needsParentConfirm` 从「以后再说」改成「不做」
      （兑换是异步不阻塞孩子，打卡审批会让孩子点完看不到星光）

## 3. `parentReport.js` 两个纯读函数

- [x] 写 `miniprogram/utils/parentReport.js`：`boardState` / `dailyReport`，
      **一个写函数都没有**（拆模块的判据是「它写不写盘」，头注释写下这条）
- [x] `boardState`：`today` / `week` / `trends` / `totals` 四段
- [x] `today.done` 数**三类合计的启用中任务**（不是 `dayProgress` 的九格），
      `goal` 是 `dailyGoal`、`total` 是启用中的条数 —— 三个数都给页面
- [x] `week.days` 七条来自 `weekKeys(now)`，每条 `{ key, weekday, done, total,
hasRecord, qualified, today }`；`qualified` 复用 `point.js::isQualifiedDay`
- [x] `hasRecord` 只看 `days` 里有没有那个键 —— 与「一项都没完成」是两种不同的零
- [x] `week.minDays` 读 `WEEKLY_BONUS.minDays`（页面不写 `5`），
      `bonusDone` 比 `lastWeeklyBonusWeek` 与 `weekKeys(now)[0]`
- [x] `trends` 三条各七个整数：`round(该类启用中完成 / 该类启用中的条数 × 100)`，
      **一条都没启用落 `0`**（照线上 `Sr`），下标与 `week.days` 一一对应
- [x] `totals`：`charsLearned` / `charsMastered`（识字两个数都给）/ `poems` /
      `stage` / `readMinutes`（**遍历 `days` 现算**，不落盘累计字段）/ `days`
- [x] `dailyReport(save, key)`：`doneList` / `todoList` 两张列表构成划分，
      `done = doneList.length`（**不另数一次**）
- [x] 停用的任务两张列表都不含它（即使当天打过卡）
- [x] `todoList` **不截断**（线上 `.slice(0, 8)` 且无提示）
- [x] `sentences` 三条规则全从数据来，**一个任务 id 都不写死**
      （线上写死 `brush-am` 却说「早晚刷牙」）；不做那句重复触发的「建议明天继续复习」
- [x] `currency` 走 `point.js::dayEarned`（不重算），`pet` 是等级与心情的快照
- [x] `days` 里没有那个键时等同「空的一天」，**不抛错**
      （只对非法入参抛错，`AGENTS.md` 第 5 节第 6 条）

## 4. `resolveRedemption` 与 `parentTasks` 的新字段

- [x] `miniprogram/utils/parentTasks.js` 加
      `resolveRedemption(save, key, at, action, now)` —— 一个函数两个动作
      （线上分两个，其中 `rejectExchange` 漏了状态检查）
- [x] 记录的身份是 `at` 不是数组下标（列表渲染之后孩子还能再申请）
- [x] `'done'`：纯状态迁移，**货币一分不动、流水不加行**（申请时已扣）
- [x] `'cancelled'`：退 `medalCost`，**走 `postLedger(next, key, 'earn', { star: 0,
gem: 0, petFood: 0, medal: record.medalCost }, `退回：${record.name}`, now)`** ——
      不直接改 `currency`（`point.js` 的不变式）
- [x] 退款落在**驳回那一天**的流水里（`key` 是入参，`utils/` 不读时钟）
- [x] `at` 找不到抛 `RangeError`；`action` 非法抛 `RangeError`；
      `now` 非有限数抛 `TypeError`；那条已不是 `'pending'` 时**原样返回入参**
- [x] `parentTasks(save)` 加 `pending` 字段（与三张兑换卡并列），
      **空列表是 `[]` 不是 `null`**（线上空时整块卡片消失）
- [x] `miniprogram/utils/reward.js`：`STATUS_TEXT` 补 `cancelled: '已取消'`（`REWARD-18`），
      `rewardState().redemptions` 三种状态**全列**（不过滤已取消的）

## 5. 测试

- [x] 写 `tests/parentReport.test.js`，覆盖 `PARENT-54` ~ `PARENT-71`
- [x] `tests/parentTasks.test.js` 补 `PARENT-72` ~ `PARENT-77`
- [x] `tests/reward.test.js` 补 `REWARD-18`（三条 `statusText` + 三条都在列表里）
- [x] `PARENT-55` / `PARENT-65` 是一对：少了后者，一个只在看板上过滤 `enabled` 的
      实现也能全绿 —— 那正是线上缺陷 14 的形状
- [x] `PARENT-56` 要造 `goal < total` 且完成数正好等于 `goal` 的那一天
      （把 `met` 写成 `done >= total` 的实现能过 `PARENT-54`、过不了 `56`）
- [x] `PARENT-58` / `PARENT-60` 是两种不同的「零」，少了前者就是缺陷 13
- [x] `PARENT-66` 是不带具体数字的不变式规格：存档要有停用任务、
      有停用任务的打卡记录、有未完成项
- [x] `PARENT-72` / `PARENT-73` 是一对，后者**同时断言流水多了一行**
      （只断言 `currency.medal` 变了会让「直接改 `currency`」全绿）
- [x] `PARENT-74` 断言对象同一性（`toBe`）
- [x] 按 `AGENTS.md` 第 13 条：`boardState` / `dailyReport` / `parentTasks` 的规格
      断言读取入口的输出，`resolveRedemption` 的规格断言存档里落了什么

## 6. 页面

- [x] `miniprogram/pages/board/` 四个文件（第 12 个 page，**`app.json` 不加第五个 tab**）
- [x] 看板页自己一层 PIN 蒙层，与 `parent.js` 那层**同形但不共用**
      （重复的只有那 20 行，第三处出现时再抽 —— 这笔债记在 `doc.md` 里）
- [x] 看板一页两段（`tab` 字段，与 `parent.js` 同形）：看板段 / 报告段
- [x] 看板段：今日四个数（页面写「完成 5 项 · 目标 6 项（共 18 项）」）+
      本周七格日历 + 三条七日趋势**柱子**（WXSS 百分比高度，不上 canvas）+ 四格累计
- [x] `hasRecord` 为 `false` 的格子显示「—」且**点不动**
- [x] 报告段：翻天用 `week.days` 那七个键，**不开 `picker`**；
      叙述句 + ✅ 已完成 / ⏳ 未完成 / 📚 学习 / 🎁 奖励与宠物
- [x] `pages/parent/parent.js`：任务段补待兑现列表（约 60 行），
      每条两个按钮「✅ 已给她了」/「↩️ 退回勋章」，后者 `wx.showModal` 二次确认
- [x] 任务段加一个「打开看板」按钮跳 `pages/board/board`
- [x] 没有待兑现时显示一句「没有待兑现的兑换」（不是整块消失）
- [x] 每次写入后 `if (next === this.save) return`，再落盘

## 7. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`（追加第三段一节）：实际做法、与 `doc.md` 的偏差、
      还剩什么（`stickerCollection` / `lastFreeStickerDate` 仍未接）
- [x] `docs/vision.md`：P7 的状态从「进行中」改成「已完成」，补第三段的结论
      （三处偏离、七个新缺陷、`needsParentConfirm` 从「以后」变「不做」）
- [x] 留档本次 prompt 到 `prompts/runs/`
