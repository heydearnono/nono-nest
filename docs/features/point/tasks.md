# 积分与流水 · 实施清单

顺序按依赖：纯函数先落，首页最后接。`point.js` import `habit.js`，反向不许。

## 1. 打卡发放纯函数

- [x] 写 `miniprogram/utils/point.js`：`checkAndAward` / `uncheckAndRefund` / `ledgerOf` / `dayEarned`
- [x] 产出值读任务自身的 `starReward` / `petFoodReward`，**不引入 `pointRules`**（理由见 `doc.md`）
- [x] 幂等判断用 `check(...) === save` 的对象同一性，不重复调 `isChecked`
- [x] 扣回用 `Math.max(0, ...)`，货币不出现负数；流水仍记应扣的量
- [x] 四个币种字段在流水里恒定存在（没变动的填 0），不留 `undefined`

## 2. 测试

- [x] 写 `tests/point.test.js`，覆盖 `POINT-01` ~ `POINT-19`
- [x] `POINT-06`（不改入参）要单独断言原 `save` 的 `currency` 与 `days` 都没动
- [x] `POINT-16` 要断言 `checks` 与 `ledger` 同时存在 —— 这是 `days[dayKey]` 兄弟键不互相覆盖的回归防线
- [x] `POINT-10` 的断言要同时看货币（收敛到 0）与流水（记应扣的量），两者刻意不一致

## 3. 首页接货币

- [x] `pages/home/home.js`：打卡改调 `checkAndAward` / `uncheckAndRefund`，不再直接调 `check` / `uncheck`
- [x] `render()` 里补 `star` / `petFood` 两个 data 字段
- [x] `home.wxml` / `home.wxss` 加一条货币带（`⭐ n` `🍖 n`），宝石与勋章不显示
- [x] 打卡成功 `wx.showToast` 提示 `太棒啦！+n⭐`，取消提示 `已取消打卡`
- [x] 页面里仍不写任何阈值或公式（`AGENTS.md` 第 3 节）

## 4. 收尾

- [x] 跑 `npm run check`，全绿（4 份 doc.md，67 条规格；75 个测试）
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 `PET`（P4）与 `REWARD` 的影响
- [x] 回 `docs/features/habit/doc.md` 补一句：`starReward` / `petFoodReward` 的读取点在 `POINT`
- [x] 回 `docs/features/habit/summary.md` 修正「发放挂在 `check` 之外」那条建议 —— 实际合成了一个函数
- [x] `docs/glossary.md` 的 `POINT` 区说明确认无需改动（`ledgerEntry` 已在实体表里）
- [x] 留档本次 prompt 到 `prompts/runs/`
