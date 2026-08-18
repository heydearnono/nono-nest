# prompts/

产出本仓库业务代码的 prompt 记录。这是 `AGENTS.md` 第 6 节要求的资产，不是可选的附录。

## 目录

```
runs/YYYY-MM-DD-<topic>.md   真实发生过的 prompt 迭代记录
templates/                   同类 prompt 用过两次以上才提炼到这里
```

`templates/` 里目前一份：[templates/feature-round.md](templates/feature-round.md)
——「一轮功能落地」的记录骨架，从 `runs/` 里 12 份同形记录提炼
（`p3a-point` 起到 `p7-parent-3` 止）。按约定模板必须从两次以上的真实使用中长出来，
不预先设计；这一份逾期很久才落，所以它记的是实际稳定下来的形状，不是设想。
方法论沿用 `../../prompt-forge`（scorecard、改写方法、评分维度），本仓库不重写。

## runs 记录写什么

每份记录至少包含四段（骨架与写作要求见
[templates/feature-round.md](templates/feature-round.md)）：

1. **raw prompt** —— 最初脱口而出的那句话，原样保留，不要事后美化
2. **improved prompt** —— 补齐目标、上下文、约束、验收标准之后的版本
3. **实际结果** —— AI 做了什么，哪些直接可用，哪些返工
4. **复盘** —— 下次应提前给什么上下文，这类任务是否值得提成模板

保留 raw prompt 是这套记录唯一的价值来源。只存改写后的漂亮版本，
就看不出改写到底带来了什么差别，也就无从迭代。
