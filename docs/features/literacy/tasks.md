# 识字（2000 字库 + 复习调度）· 实施清单

顺序按依赖：先补存储层（`dayKeyAfter` 与 `learningProgress`），再术语，
再搬字库，再纯函数与测试，最后页面与入口。
`literacy.js` import `pet.js` / `dayKey.js` / `data/characters.js`，反向不许。

## 1. 存储层先行（`AGENTS.md` 第 5 节第 2 条）

- [x] `docs/features/storage/doc.md`：已加 `dayKeyAfter` 与 `learningProgress` 两节、
      `DAY-10` ~ `DAY-12`、`SAVE-13`、`IMPORT-11`
- [x] `miniprogram/utils/dayKey.js`：加 `dayKeyAfter(now, days)`，锚中午再 `setDate(+n)`
- [x] `days` 非整数抛 `RangeError`，`now` 非有限数抛 `TypeError`
- [x] `miniprogram/utils/save.js`：`learningProgress.literacy.chars` 的默认值与收敛
      （`step` 夹 `0`~`7`、`due` 只认 `YYYY-MM-DD` 形状、`wrong` 非负整数）
- [x] `miniprogram/utils/importOnline.js`：线上五结构映射成 `chars`
- [x] `tests/dayKey.test.js` 补 `DAY-10` ~ `DAY-12`
- [x] `tests/save.test.js` 补 `SAVE-13`，`tests/importOnline.test.js` 补 `IMPORT-11`

## 2. 术语

- [x] `docs/glossary.md`：时间表加 `dayKeyAfter`，学习调度表加 `step` / `due`
- [x] 改掉「识字与古诗共用同一套调度」——线上两条路径是分开的，改成「共用同一套术语」
- [x] `LITERACY` 区名早已登记，不重复加

## 3. 字库搬进 `data/`

- [x] 写脚本从 `.scratch/characters--34XV0qT.js` 生成 `miniprogram/data/characters.js`
      （脚本一次性使用，不入库 —— 入库的是产物）
- [x] 只搬 4 个字段：`char` / `pinyin` / `words` / `sentence`，**不搬 `emoji`**
- [x] 另导出 `CHAR_EMOJI` 15 个 emoji 的调色板
- [x] 2000 条、顺序一字不动；头注释记下「前 415 条字频序、其后拼音序，不许排序去重」
- [x] 校验产物：条数 2000、字互不重复、逐条与原始数据包深比对（含 `emoji === palette[i%15]`）
- [x] 跑 `npm run format` 让 Prettier 定型，确认体积仍远低于 2 MB 主包上限

## 4. 识字纯函数

- [x] 写 `miniprogram/utils/literacy.js`：`literacyState` / `gradeChar`
- [x] `REVIEW_STEPS = [1, 2, 4, 7, 14, 30]`，`step` 是连续答对次数（`1`~`6` 对应六个间隔、`7` 已掌握）
- [x] 新字池：未学过的字里语料顺序最前的两个，不用 `dayIndex` 起步
- [x] 复习队列：`due <= 今天` 且 `step < 7`，按 `wrong` 降序、其次语料顺序，`slice(0, 8)`
- [x] 两个队列都排除「当天已评过」的字（`days[key].learning.literacy` 两个列表）
- [x] `gradeChar` 一个函数收两种评分；当天重复评分原样返回入参
- [x] 发放先行、记录后写（`day` 从 `awarded` 里取），与 `completeLearning` 相反
- [x] `checkAwardAndGrow(save, key, habit.id, now, 8)`，学习域同价
- [x] 打卡条件：当天新字满 2；新字池空时改判为「当天到期的字全部复习完」
- [x] `literacyState` 不抛错（缺任务时 `done` 为 `false`、坏 `step` 收敛）
- [x] `gradeChar` 严格：未登记的字 / 无对应任务抛 `RangeError`，`now` 非有限数抛 `TypeError`
- [x] 卡片形状里带 `emoji`（`CHAR_EMOJI[下标 % 15]` 在这一层算），页面不写那 15 个字符

## 5. 测试

- [x] 写 `tests/literacy.test.js`，覆盖 `LITERACY-01` ~ `26`
- [x] `LITERACY-05` 逐档断言 +1 / +2 / +4 / +7 / +14 / +30，这是偏离线上最要紧的一条
- [x] `LITERACY-13` 断言对象同一性（`toBe`），不是深相等
- [x] `LITERACY-16` 断言经验 +8 而不是自律的 5（与 `LEARN-08` / `HEALTH-03` 成对）
- [x] `LITERACY-19` 断言 `checks` / `ledger` / `learning` 三个兄弟键互不覆盖
- [x] `LITERACY-24` 按 `AGENTS.md` 第 13 条断言**读取入口的输出**，不是存档里落了什么
- [x] `LITERACY-26` 造一份「2000 字全学过」的存档（构造 `chars`，不逐个 `gradeChar`）

## 6. 页面与入口

- [x] `miniprogram/pages/literacy/` 四个文件
- [x] 顶部：「今日新字 N/2」+「学过 N 字 · 已掌握 N 字」
- [x] 两个 tab：`🆕 新字 (n)` / `🔄 复习 (n)`，不混排
- [x] 卡片：大字 + 拼音 + 组词（可缺）+ 例句（可缺）+ 右上角 emoji，缺的行不占位
- [x] 两个按钮：`我认识 ✅` / `还不太会 🔄`；两队列都空时显示空态
- [x] `onLoad` 取数（`navigateTo` 进来），评分后 `setData` 重渲染，落盘前判 `next === this.save`
- [x] `miniprogram/data/learningModules.js`：`literacy` 的 `page` 填上，灰格子变亮
- [x] `app.json` 加 page（不加 tab，识字从学习页进）

## 7. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 P3-b 与 `POEM` 的影响
- [x] `docs/vision.md` 的 P5 识字那段改成「已完成」
- [x] 留档本次 prompt 到 `prompts/runs/`
