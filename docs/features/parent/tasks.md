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
