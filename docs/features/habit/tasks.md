# 自律打卡与首页 · 实施清单

顺序按依赖：默认任务表是常量，纯函数用它，页面用纯函数，`app.js` 的读写包装最后接。

## 1. 默认任务表

- [x] 写 `miniprogram/data/defaultHabits.js`：18 条，字段名按 glossary（`starReward` / `petFoodReward`）
- [x] 逐条核对 id、`sortOrder`、`icon`、`category` 与线上 bundle 一致；`subCategory` 不抄
- [x] 确认导出的是 `export const DEFAULT_HABITS = [...]`，零函数零判断（`AGENTS.md` 第 3 节）

## 2. 打卡纯函数

- [x] 写 `miniprogram/utils/habit.js`：`seedHabits` / `listHabits` / `isChecked` / `check` / `uncheck` / `dayProgress` / `habitStreak`
- [x] `check` / `uncheck` 返回新 `save`，不改入参 —— 用一条断言把这件事钉住（`HABIT-10`）
- [x] 往前推日期用 `dayKey(now - n * 86400000)` 之外的做法：夏令时下 86400000 会错日，
      用 `new Date(y, m, d - n)` 让 `Date` 自己处理月末与时区
- [x] 写 `tests/habit.test.js`，覆盖 `HABIT-01` ~ `HABIT-17`（实现时新增了 `HABIT-17`）
- [x] 连续天数的 30 天上限要有断言，否则改成 while 循环也测不出来（`HABIT-16`）

## 3. 存档读写包装

- [x] 在 `miniprogram/app.js` 加 `readSave()` / `writeSave(save)`，键名 `nono-save`
- [x] `readSave` 必须过 `normalizeSave`；`writeSave` 盖 `updatedAt`，首次写补 `createdAt`
- [x] `wx.getStorageSync` 抛错时退回 `normalizeSave(undefined)`，不让首页白屏

## 4. 首页

- [x] 改 `pages/home/home.js`：`onShow` 读存档 → `listHabits` / `dayProgress` / `habitStreak` → `setData`
- [x] 改 `home.wxml` / `home.wxss`：问候语 + 进度 + 连续天数 + 九个打卡格子，格子够大（≥ 160rpx，实际 180rpx）
- [x] 打卡事件只做「调纯函数 → 写 storage → setData」，页面里不写任何阈值或公式
- [x] 用 `onShow` 而非 `onLoad` 取当天数据 —— 跨零点后回到前台，日期键必须重算

## 5. 收尾

- [x] 跑 `npm run check`，全绿（3 份 doc.md，48 条规格；55 个测试）
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 `POINT`（P3）的影响
- [x] 回 `docs/features/storage/doc.md` 补一句：`days[dayKey].checks` 的结构由本 feature 定义
- [x] 留档本次 prompt 到 `prompts/runs/`
