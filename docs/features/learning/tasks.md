# 学习（阅读 + 英语）· 实施清单

顺序按依赖：常量先落，再纯函数（含 `pet.js` 的参数改动），再测试，最后三个页面与 tabBar。
`learning.js` import `pet.js`，反向不许。

## 1. 术语与常量

- [x] `docs/glossary.md`：加 `module` / `learningLog` / `mode` 三条术语，区名表加 `LEARN`
- [x] 写 `miniprogram/data/learningModules.js`：5 条，`module` / `name` / `icon` / `desc` / `page`
- [x] 三个未做的子模块 `page` 为空串（不加 `ready` 布尔值，见 `doc.md`）
- [x] 常量区纪律：零函数、零判断（`AGENTS.md` 第 3 节）

## 2. `checkAwardAndGrow` 加经验参数

- [x] `miniprogram/utils/pet.js`：第五参数 `gainedExp = EXP_PER_CHECK`，默认值即原行为
- [x] `docs/features/pet/doc.md` 的函数签名一行同步改（改行为必先改文档，`AGENTS.md` 第 5 节第 2 条）
- [x] 首页调用点不改 —— 默认值就是自律打卡的 5，`PET-15` / `MOOD-01` 断言不动

## 3. 学习纯函数

- [x] 写 `miniprogram/utils/learning.js`：`listLearning` / `learningLog` / `learningBlock` / `completeLearning`
- [x] 一条打卡链，两张规范化表（按 `module` 取），不写 `completeRead` / `completeEnglish`
- [x] 任务按 `module` 找（不假设 `id === module`），找不到抛 `RangeError`
- [x] 记录里不存 `at` —— 打卡时刻已在 `checks[habitId].at`
- [x] `learningLog` 做表单 ↔ 存档的双向转换（`words` / `sentences` 的 join / split）
- [x] `learningBlock` 返回原因码 `'done'` / `'noTitle'` / `null`，页面不写校验
- [x] 打不了卡时原样返回（对象同一性），抛错只有未登记 `module` 与非有限数 `now`

## 4. 测试

- [x] 写 `tests/learning.test.js`，覆盖 `LEARN-01` ~ `11`、`READ-01` ~ `08`、`ENG-01` ~ `07`
- [x] `LEARN-08` 断言经验 +8 而不是 +5（这是本轮唯一改到 `PET` 区实现的地方）
- [x] `LEARN-10` 断言 `checks` / `ledger` / `learning` 三个兄弟键互不覆盖
- [x] `READ-02` 与 `ENG-06` 刻意不一致：阅读书名必填、英语空表单也能打卡
- [x] `LEARN-06` 断言第二次提交原样返回且记录不被改写（与线上偏差的回归防线）

## 5. 三个页面与 tabBar

- [x] `miniprogram/pages/learning/` 四个文件：五格列表 + 「今天 N/5」
- [x] `miniprogram/pages/reading/` 四个文件：书名 / 分钟 / 页数 / 方式 / 最爱 / 心情
- [x] `miniprogram/pages/english/` 四个文件：分钟 / 单词 / 句子 / 跟读次数 / 家长备注
- [x] `app.json` 加三个 pages 与 tabBar 第三项（`📚 学习` 插在中间），不用图片图标
- [x] 页面里不写阈值与校验，提示语按 `learningBlock` 的原因码选
- [x] 灰格子点击给一句「还在做」，不 `navigateTo` 空路径

## 6. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对余下三个子页与 P3-b 的影响
- [x] `docs/vision.md` 的 P5 行改成「进行中」，并说明本轮只做两个子页
- [x] 留档本次 prompt 到 `prompts/runs/`
