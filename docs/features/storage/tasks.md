# 数据模型与存储层 · 实施清单

顺序按依赖：`dayKey` 无依赖，`save` 用到 `dayKey` 的键格式，`importOnline` 用到 `save` 的默认值。

## 1. 自然日模块

- [x] 写 `miniprogram/utils/dayKey.js`：`dayKey(now)`、`isSameDay(a, b)`
- [x] 写 `tests/dayKey.test.js`，覆盖 `DAY-01` ~ `DAY-05`
- [x] 断言用固定时间戳构造，不调 `Date.now()`；跨日边界用 23:59:59.999 与 0:00:00.000

## 2. 存档模块

- [x] 写 `miniprogram/utils/save.js`：`defaultSave()`、`normalizeSave(raw)`
- [x] 数值收敛逻辑抽成局部辅助函数（clamp 到整数区间），不在每个字段里重复写
- [x] 写 `tests/save.test.js`，覆盖 `SAVE-01` ~ `SAVE-11`
- [x] 确认 `defaultSave()` 每次返回新对象 —— 返回共享引用会让两处修改互相污染

## 3. 线上导入模块

- [x] 写 `miniprogram/utils/importOnline.js`：`importOnlineSave(onlineJson)`
- [x] 字段映射表写成模块内常量，与 `doc.md` 的映射表逐行对应
- [x] 写 `tests/importOnline.test.js`，覆盖 `IMPORT-01` ~ `IMPORT-09`（实现时新增了 `IMPORT-09`）
- [x] 用一份**真实导出的线上 JSON 片段**做一次端到端断言，不只测构造的小对象

## 4. 收尾

- [x] 跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对后续 feature 的影响
- [x] 留档本次 prompt 到 `prompts/runs/`
