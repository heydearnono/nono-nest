# 2026-08-12 · P2 自律打卡与首页

- 阶段：`docs/vision.md` P2
- 产出：`docs/features/habit/{doc.md,tasks.md,summary.md}`、
  `miniprogram/data/defaultHabits.js`、`miniprogram/utils/habit.js`、
  `miniprogram/app.js`、`miniprogram/pages/home/*`、`tests/habit.test.js`

## 原始 prompt

```
继续下一步
```

## 这条 prompt 为什么够用

三个字能跑完一个完整阶段，靠的不是 prompt 本身，而是它之前已经落地的东西：

- `docs/vision.md` 的阶段表说清了「下一步」是哪一步（P2，且 P0/P1 已标已完成）
- `AGENTS.md` 第 5 节规定了每一步的动作顺序（先 `doc.md` 再 `tasks.md` 再实现再门禁）
- `npm run check` 里的 `validate-docs.mjs` 让「文档与实现不一致」变成一次失败，
  而不是一次需要人发现的疏漏

结论：**把上下文写进仓库，prompt 就可以很短。** 反过来，如果 prompt 需要每次重复
「记得先写文档」「记得跑门禁」，那说明该写进 `AGENTS.md` 的东西还在人的脑子里。

## 这一轮的两个判断

**逆向的数字必须自己数一遍。** 上一轮 `storage/summary.md` 里我写了「线上有 8 条默认
任务」，这轮抄默认表时才发现是 18 条 —— 那个 8 是「今日全勤」判定用的 id 数量，
跟任务总数没关系。一个错的「事实」会顺着所有下游文档传播。
这轮的 18 条是把 bundle 里的 `nr=[...]` 数组逐条数出来、逐条核对 id 的。

**发现文档漏了规格时，先改文档。** 写 `check` 时发现 `doc.md` 没规定非法 `now`
怎么办（不校验会写进 `NaN`，序列化后变 `null`，「打过卡」还在但时刻丢了）。
按第 5 节第 2 条补了 `HABIT-17` 到规格表再写实现，而不是先写实现再回头补文档 ——
后者的问题是补文档这一步很容易忘，而门禁只检查「声明过的 ID 有测试」，
不检查「实现里的分支有没有声明」。

## 下次可以更好的地方

`doc.md` 的小节标题写「六个纯函数」而实际是七个，是写文档时数错了，直到写
`summary.md` 才发现。门禁查不出这类错 —— 它比对的是 Spec ID，不是散文里的数字。
**散文里尽量不写可数的数字**，或者写了就在收尾时对着代码核一遍。
