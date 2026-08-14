# 勋章闭环（兑换 · 成就 · 奖励结算）· 实施清单

顺序按依赖：先补存储层（`lastWeeklyBonusWeek` 与两个数组的元素收敛），再术语已改完，
再 `core` 字段与两份常量表，再纯函数与测试，最后页面与首页货币带。
`reward.js` import `point.js` / `habit.js` / `dayKey.js` / `data/`，反向不许；
`pet.js` import `reward.js`，`reward.js` **不许** import `pet.js`。

## 1. 存储层先行（`AGENTS.md` 第 5 节第 2 条）

- [x] `docs/features/storage/doc.md`：已加 `lastWeeklyBonusWeek` 与元素收敛两节、
      `SAVE-14` ~ `SAVE-16`、`IMPORT-12` / `IMPORT-13`
- [x] `miniprogram/utils/save.js`：`lastWeeklyBonusWeek` 的默认值与收敛（复用 `DAY_KEY_RE`）
- [x] `miniprogram/utils/save.js`：`redemptions` 元素收敛（非对象丢掉、`status` 只认两值、
      `at` / `medalCost` 非负整数、未知字段丢弃）
- [x] `miniprogram/utils/save.js`：`achievements` 只留字符串并去重
- [x] `miniprogram/utils/importOnline.js`：`exchangeRecords` → `redemptions` 元素映射
      （`approved` → `'done'`、`pending` 保持、`rejected` 整条丢掉）
- [x] `miniprogram/utils/importOnline.js`：`lastWeeklyBonusWeek` 原样落，缺键落空串
- [x] `tests/save.test.js` 补 `SAVE-14` ~ `SAVE-16`
- [x] `tests/importOnline.test.js` 补 `IMPORT-12` / `IMPORT-13`

## 2. 术语与既有文档

- [x] `docs/glossary.md`：实体表加 `status`，时间表加 `weekKey` / `weeklyBonus`，
      改 `allDone` 为七条并补散文
- [x] `docs/features/point/doc.md`：追加 `POINT-20` ~ `POINT-31` 与 `postLedger` 一节，
      范围外两条划掉
- [x] `docs/features/habit/doc.md`：任务定义加 `core` 字段与散文，`days` 兄弟键补 `bonuses`，
      范围外那条划掉
- [x] `docs/features/pet/doc.md`：`checkAwardAndGrow` 成为唯一结算入口的说明与依赖链
- [x] `REWARD` / `ACHV` 区名早已登记，不重复加

## 3. `core` 字段与两份常量表

- [x] `miniprogram/data/defaultHabits.js`：18 条各加 `core`，七条为 `true`
      （`wake` `brush-am` `literacy` `reading` `exercise` `vegetables` `poop`）
- [x] 头注释记下「`core` 是线上没有的字段，名单不含 `bath`，理由在 features/reward」
- [x] 写 `miniprogram/data/rewards.js`：三条，四个字段，不抄 `needsConfirm` / `enabled`
- [x] 写 `miniprogram/data/achievements.js`：十一条原样转抄，
      `char-50` 的 `description` 改成「学过 50 个汉字」
- [x] 两份表的字段结构在 `doc.md` 里都已说明（`AGENTS.md` 第 3 节）

## 4. `point.js` 的三处追加

- [x] `post` 导出成 `postLedger`，内部实现一行不改
- [x] 加 `listCore(save)`（启用中的核心任务）与 `coreDone(save, key)`（当天完成几条）
- [x] 加 `awardAllDone(save, key, now)`：水位 `days[key].bonuses.allDone`，`+1🏅`
- [x] 加 `awardWeeklyBonus(save, key, now)`：达标 ≥ 5 天，水位 `lastWeeklyBonusWeek`
- [x] 达标日判据只有一个函数，导出给 `full-week` 成就共用
- [x] `POINT-01` ~ `POINT-19` 全部不受影响（跑一遍确认）

## 5. `reward.js` 五个纯函数

- [x] 写 `miniprogram/utils/reward.js`：`rewardState` / `achievementState` /
      `redeem` / `settleDay` / `unlockAchievements`
- [x] `settleDay` 顺序固定：全勤 → 周奖励 → 成就（`daily-3` 要数到今天）
- [x] 无事发生时原样返回入参（对象同一性）
- [x] `redeem`：申请即扣勋章、记录落 `'pending'`、三个字段是快照、写流水
- [x] 勋章不够原样返回；未登记 `rewardId` 抛 `RangeError`
- [x] 十一条判据按 `condition` 分派（与 `health.js` 的 `FIELDS` 注册表同构）
- [x] `char-50` 数 `chars` 的键数（学过），不是 `step === 7`
- [x] `poem-10` / `math-10` 读缺失的子键时返回 `0`，不抛错
- [x] 解锁写流水（`解锁成就：X`），进度每次现算、不存
- [x] 两个 `*State` 不抛错，`redeem` / `settleDay` 严格

## 6. 挂进打卡入口

- [x] `miniprogram/utils/pet.js`：`checkAwardAndGrow` 末尾调 `settleDay`
- [x] 确认四条打卡路径（自律、健康、学习表单、识字）都因此接上，页面不必各自调
- [x] `PET-15` ~ `PET-18` / `MOOD-01` ~ `MOOD-04` 全部不受影响（跑一遍确认）
      —— `LITERACY-26` 的流水条数断言改成只数那条打卡流水（存档顺带满足 `char-50`）

## 7. 测试

- [x] 写 `tests/reward.test.js`，覆盖 `REWARD-01` ~ `15` 与 `ACHV-01` ~ `16`
- [x] `tests/point.test.js` 补 `POINT-20` ~ `POINT-31`
- [x] `REWARD-06` / `REWARD-12` / `ACHV-03` / `ACHV-16` 断言对象同一性（`toBe`）
- [x] `REWARD-11` 断言 `settleDay` 的顺序：同一次调用里 `daily-3` 已含今天
- [x] `REWARD-13` 断言 `checkAwardAndGrow` 一次调用就发勋章（挡住「留给页面两步走」）
- [x] `POINT-24` 断言取消打卡后勋章不退、水位不清
- [x] `POINT-26` 造一份七条核心项全被停用的存档，断言不算全勤
- [x] `ACHV-05` 造 50 个 `step: 0` 的字，断言数「学过」而不是「已掌握」
- [x] `ACHV-13` 跨周断言：进度回落但 `unlocked` 仍为 `true`
- [x] 按 `AGENTS.md` 第 13 条：`*State` 的规格断言读取入口的输出，
      水位类的规格断言存档里落了什么
- [x] `ACHV-01` 的期望改成「除 `pet-5` 为 1 外全 0」：宠物等级初始值就是 1 级，
      给这一条单独减 1 才是「同一份数据两套口径」（doc.md 已补散文）

## 8. 页面与入口

- [x] `miniprogram/pages/reward/` 四个文件
- [x] 顶部：`🏅 n` `💎 n` +「今日七项全满 +1🏅 · 本周达标 N/5 天 +1💎」
- [x] 兑换：三张卡片，勋章不够置灰（读 `items[].affordable`，页面不自己比）
- [x] 兑换记录：最新在前，显示图标 / 名字 / 花了几枚 / 状态文案
- [x] 成就：十一行进度条，已解锁加 ✅
- [x] `onShow` 取数并调 `settleDay`（导入后补发），落盘前判 `next === this.save`
- [x] `miniprogram/pages/home/`：货币带从两种改四种，删掉「宝石与勋章产不出」的注释
- [x] 首页加一个进奖励中心的入口按钮（整条货币带可点，靶子比小按钮大）
- [x] `app.json` 加 page（不加第五个 tab）
- [x] toast 一次只弹最要紧的一条（勋章 > 周奖励 > 成就），不做弹层与动画
      —— 按结算前后两份存档的水位差判断，不重新算规则（doc.md 已补散文）

## 9. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 `STICKER` 与 P7 的影响
- [x] `docs/vision.md` 的 P3 那段改成「已完成」，并把「8 条核心 id」的说法改成七条
- [x] 留档本次 prompt 到 `prompts/runs/`
