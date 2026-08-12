# 数据模型与存储层 · 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/utils/dayKey.js`、`save.js`、`importOnline.js` 及三份对应测试
- 规格：`DAY-01` ~ `DAY-05`、`SAVE-01` ~ `SAVE-11`、`IMPORT-01` ~ `IMPORT-09`（25 条）
- 门禁：`npm run check` 全绿（2 份 doc.md，31 条规格，34 个测试）

## 实现要点

**三个模块的依赖是单向的**：`dayKey` 无依赖；`save` 只用到 `dayKey` 的键格式（是约定，
不是 import）；`importOnline` 真的 import 了 `save`，把补齐与收敛全部委托给 `normalizeSave`。
好处是字段白名单只存在一处 —— 加一个存档字段时，`importOnline` 只需在映射表里加一行，
不用同时改两处的白名单。

**收敛逻辑集中在 `clampInt(value, min, max, fallback)`**。无上界的字段传
`Number.POSITIVE_INFINITY`，所以货币、经验、时间戳和 0–5 的宠物刻度走同一个函数。
`Math.round` 顺手满足了 `SAVE-07`（2.7 → 3），不必单独写取整分支。

**未知顶层字段的丢弃是「重建」而非「删除」**：`normalizeSave` 从不 `{...raw}`，
而是逐字段挑出来写进新对象。`SAVE-10` 因此是结构的必然结果，不是一条额外的过滤规则。
代价是新增字段必须记得在这里加一行 —— `IMPORT-01` 的端到端断言
（`Object.keys(result).sort()` 等于 `Object.keys(defaultSave()).sort()`）会在漏加时报错。

## 与 `doc.md` 的偏差

**新增了 `IMPORT-09`（ISO 字符串 → 毫秒数）。** 写测试时才发现 `doc.md` 的映射表漏了
`createdAt` / `updatedAt`：线上存的是 `new Date().toISOString()`，本仓库存档约定是毫秒数
（见 `docs/glossary.md`「时间」）。这不是可选的兼容处理 —— 不转换的话，导入后
`updatedAt` 会是字符串，之后任何 `now - updatedAt` 都得到 `NaN`。
按 `AGENTS.md` 第 5 节第 2 条先补了 `doc.md` 的规格表与映射表，再写实现。

**明确写下了「线上多出来的 9 个键本层不接」。** `doc.md` 原文只说了存档结构长什么样，
没说清 `pointRules` / `rewardRules` / `learningProgress` / `stickerCollection` 这些
被丢掉的键属于遗漏还是取舍。补了一段说明：属于后续 feature，等它们定义自己的结构再扩。
这条在导入时是有代价的 —— 现在导入一次并不能把线上进度全带过来，
学习进度、贴纸收藏、积分规则都还在原地。因此**要提醒用户保留线上导出的 JSON 原文**，
`P3` / `P5` 落地后需要再导入一次。

除此之外没有偏离。三个模块的签名、存档结构字面量、默认值（`fullness: 3`、`mood: 4`、
`pin: '1234'`、`dailyGoal: 6`）都与 `doc.md` 一致，也与线上 bundle 的初始 state 一致。

## 刻意保留的不一致：错误处理三种策略

同一个 feature 里三个模块用了三种错误策略，这是设计而非疏忽：

| 模块               | 非法入参     | 理由                                           |
| ------------------ | ------------ | ---------------------------------------------- |
| `dayKey`           | 抛 TypeError | 调用方传错时间戳是编程错误，早炸早发现         |
| `normalizeSave`    | 不抛，收敛   | 存档来自 storage，读失败就白屏，违反「不清零」 |
| `importOnlineSave` | 抛 TypeError | 用户主动粘贴，静默用默认值等于当着他的面清零   |

`AGENTS.md` 第 5 节第 6 条要求纯函数对非法入参抛错，`normalizeSave` 是它唯一的例外，
理由写在 `doc.md` 里。后续写 feature 时不要把这个例外推广到别的模块。

## 对后续 feature 的影响

- **`days[dayKey]` 的内部结构还没定。** 本层只保证原样存取，`SAVE-11` 断言的是透传。
  `HABIT`（P2）是第一个要定它的 feature，定完要回来在 `doc.md` 里补一句指向。
- **`habits` 数组的元素结构同样未定**，但线上已有一份 18 条的默认任务表
  （9 条 `habit` + 5 条 `learning` + 4 条 `health`，如 `wake` / `brush-am` / `literacy` /
  `exercise` / `poop`），P2 应当照抄它的 id 与 `sortOrder`，不要另起一套。
  注意「今日全勤」判定用的只是其中 8 条，不等于这 18 条全打完 —— 那是 `POINT` 区的事。
- **没有 storage 读写函数。** `wx.getStorageSync` / `setStorageSync` 由页面层调，
  这一层不碰 `wx.*`。P2 会是第一个需要它的页面，届时按 `AGENTS.md` 第 3 节，
  读写包装应该落在页面层或 `app.js`，不能塞进 `utils/`。
- **`version` 仍是死字段**，恒为 1。真出现第 2 版存档时，迁移分支写在 `save.js`，
  规格加在 `SAVE` 区，不新开区名。
