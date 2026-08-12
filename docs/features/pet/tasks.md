# 宠物 · 实施清单

顺序按依赖：存档字段先落（否则衰减没有基准），再纯函数，再页面。
`pet.js` import `point.js`，反向不许。

## 1. 存档层追加 `pet.lastFedAt`

- [x] `docs/features/storage/doc.md`：映射表加一行、存档结构加字段、`SAVE-12` / `IMPORT-10` 两条规格
- [x] `miniprogram/utils/save.js`：`defaultSave()` 与 `normalizeSave()` 各加 `lastFedAt`
- [x] `tests/save.test.js` 加 `SAVE-12`，`tests/importOnline.test.js` 加 `IMPORT-10`
- [x] `SAVE-10`（未知顶层字段被丢弃）的键集合断言仍要过 —— 它比对的是顶层键，`pet` 内部加字段不影响

## 2. 形象常量

- [x] 写 `miniprogram/data/petTypes.js`：5 条，`type` / `name` / `displayName` / `emoji`
- [x] `type` 与 `emoji` 抄线上 `ar` 数组，`name` 抄线上 `selectPet` 的名字映射表
- [x] 常量区纪律：零函数、零判断（`AGENTS.md` 第 3 节）

## 3. 宠物纯函数

- [x] 写 `miniprogram/utils/pet.js`：`settleFullness` / `petState` / `feed` / `play` / `choosePet` / `checkAwardAndGrow`
- [x] 衰减用整数个 6h 步长，`lastFedAt` 只前进 `步数 × 6h`，余量不抹掉（`FULLNESS-04`）
- [x] `lastFedAt === 0` 单独一支：不衰减，只立基准（`FULLNESS-01`）
- [x] 时钟回拨原样返回（`FULLNESS-06`），别让 `Math.floor` 的负数结果倒着加饱腹度
- [x] 升级循环只写一处，`feed` 与 `play` 共用
- [x] `checkAwardAndGrow` 包在 `checkAndAward` 外面，幂等靠对象同一性
- [x] `feed` / `play` 的失败是原样返回，不抛错；抛错只有未知 `type` 与非有限数 `now`
- [x] `petState` 给出 `fullnessLow` / `feedBlock` / `playBlock`，页面不写阈值

## 4. 测试

- [x] 写 `tests/pet.test.js`，覆盖 `FULLNESS-01` ~ `08`、`MOOD-01` ~ `06`、`PET-01` ~ `18`
- [x] `FULLNESS-04` 要断言 `lastFedAt` 的落点（只前进 12h），不能只断言 `fullness`
- [x] `MOOD-04` 与 `MOOD-03` 刻意不一致：打卡时开心已满经验照涨，陪玩时开心已满经验不涨
- [x] `MOOD-06` 断言取消打卡不回退经验与开心度 —— 「温和，不惩罚」的回归防线
- [x] `PET-05` 断言喂食前先结算（20h 后喂食，结果是 1 而不是 4）

## 5. 宠物页与 tabBar

- [x] `miniprogram/pages/pet/` 四个文件，`onShow` 里结算并写回存档
- [x] `app.json` 加 tabBar（`🏠 首页` / `🐾 小伙伴`），不用图片图标
- [x] `pages/home/home.js` 的打卡改调 `checkAwardAndGrow`，取消仍走 `uncheckAndRefund`
- [x] 页面里不写阈值，喂食按钮的禁用与提示语都由 `feedBlock` / `playBlock` 决定

## 6. 收尾

- [x] 跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 `REWARD` 与 P5 的影响
- [x] `docs/vision.md` 的 P4 行翻成已完成，并补一段说明衰减是本仓库加的规则
- [x] `docs/glossary.md` 确认 `lastPlayedAt` 仍是未使用的词（本轮不引入开心度衰减）
- [x] 留档本次 prompt 到 `prompts/runs/`
