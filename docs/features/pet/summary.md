# 宠物 · 完成总结

- 完成日期：2026-08-12
- 实际改动：`miniprogram/utils/pet.js`、`miniprogram/data/petTypes.js`、
  `miniprogram/pages/pet/{pet.js,pet.json,pet.wxml,pet.wxss}`、`miniprogram/app.json`（tabBar）、
  `miniprogram/utils/save.js`（`pet.lastFedAt`）、`miniprogram/pages/home/home.js`（打卡改调 `checkAwardAndGrow`）、
  `tests/pet.test.js`、`tests/save.test.js`、`tests/importOnline.test.js`
- 规格：`FULLNESS-01` ~ `08`、`MOOD-01` ~ `06`、`PET-01` ~ `19`（33 条），另加 `SAVE-12` / `IMPORT-10`
- 门禁：`npm run check` 全绿（5 份 doc.md，102 条规格，111 个测试）

## 实现要点

**衰减是本仓库加的规则，不是迁移来的。** 线上 `satiety` 只升不降，
`lastFedAt` / `lastPlayed` / `decay` 在整个 bundle 里 0 次出现。加它的理由与「只加饱腹度、
不加开心度」的取舍都在 `doc.md`，此处不重复。落地后的形状是一个字段
（`pet.lastFedAt`）加一个函数（`settleFullness`），存档层的改动小到 `SAVE-10`
（未知顶层字段被丢弃）的键集合断言一行没动 —— 它比对的是顶层键。

**`settleFullness` 的三支分别对应三条规格，不是防御性代码：**

```js
if (pet.lastFedAt === 0) return { ...save, pet: { ...pet, lastFedAt: now } }; // FULLNESS-01
const steps = Math.floor((now - pet.lastFedAt) / FULLNESS_DECAY_MS);
if (steps <= 0) return save;                       // FULLNESS-03 + FULLNESS-06 + FULLNESS-08
lastFedAt: pet.lastFedAt + steps * FULLNESS_DECAY_MS,   // FULLNESS-04：只推整数步
```

`steps <= 0` 一支同时吃下三种情况：不足 6 小时、时钟回拨（`steps` 为负）、
同一个 `now` 连续调用两次（第二次 `steps` 为 0）。**幂等不是额外写出来的，
是「整数步 + 原样返回」的副产品**，所以 `FULLNESS-08` 不需要 `pet.js` 里有对应的分支。

`lastFedAt` 只前进 `步数 × 6h` 而不是置成 `now`，是这个模块里唯一容易写错又不容易被
发现的地方：置成 `now` 会抹掉不足 6 小时的余量，于是「每 5 小时打开一次小程序」
的宠物永远不会饿。`FULLNESS-04` 因此断言的是 `lastFedAt` 的落点
（`NOW - next.pet.lastFedAt === HOUR`），不只断言 `fullness`。

**升级循环只写一处（`grow`），`feed` / `play` / `checkAwardAndGrow` 三个入口共用。**
`while (petExp >= petLevel * 100)` 抄线上；`PET-07` 用 `295 + 5` 钉住一次跨两级
（Lv.1 需 100、Lv.2 需 200，正好耗尽）。

**`checkAwardAndGrow` 包在 `point.js` 外面，`checkAndAward` 一行没改。**
这是 `docs/features/point/summary.md` 留下的约束，落地时没有改主意。幂等靠对象同一性：

```js
const awarded = checkAndAward(save, key, habitId, now);
if (awarded === save) return save;
```

## 与 `doc.md` 的偏差

**只有一处：`petState` 对坏 `type` 宽容，`choosePet` 对坏 `type` 抛错。**
`doc.md` 的「抛错只有两类」里写的是「未知的宠物形象 `type`（`RangeError`）」，
没有区分这两个函数。实现时分开了，因为它们的调用位置不同：

| 函数        | 坏 `type` 的来源                              | 行为                                   |
| ----------- | --------------------------------------------- | -------------------------------------- |
| `petState`  | 存档被改坏 / 将来删掉某个形象后的旧存档       | 回落到 `PET_TYPES[0]` 的 emoji，不抛错 |
| `choosePet` | 只可能是代码写错（按钮是 `PET_TYPES` 渲染的） | 抛 `RangeError`                        |

`petState` 在渲染路径上，抛错等于白屏 —— 与 `normalizeSave` 不抛错是同一条取舍
（`AGENTS.md` 第 5 节第 6 条的「存档宽容、渲染宽容、编程错误严格」）。
加了一条无标签测试钉住它：坏 `type` 时 emoji 回落到 `🦄`，但 `petState().type`
仍原样回显那个坏值（不悄悄改写存档里的数据）。

除此之外没有偏离。六个函数的签名、`petState` 的字段、原因码 `full` / `noFood` / `happy`、
五档称号文案（含线上原文「可爱装饰」）、`days` 不参与、tabBar 不用图片图标，都与 `doc.md` 一致。

## 两处刻意的不对称

**开心已满时：陪玩不涨经验，打卡照涨 5。** 两条规格分别钉住（`MOOD-03` / `MOOD-04`）。
线上 `playWithPet` 把「开心 +1」与「经验 +5」放在同一个 `if (!已满)` 里，
而打卡的经验是给「完成了一件事」的，与宠物开不开心无关。这看起来像 bug，
所以两条规格必须都在，光写注释挡不住下一个人「修」它。

**打卡走 `pet.js`，取消走 `point.js`。** 取消只退货币，不收回经验、不降开心度
（`MOOD-06` 断言 `mood` 与 `petExp` 都不回退）。首页因此 import 了两个模块，
`onTapHabit` 里是一个三元表达式而不是一个函数 —— 不对称是「温和，不惩罚」的直接推论。

## 结算必须落盘

宠物页 `onShow` 里是 `writeSave(settleFullness(readSave(), now))`，不是只算不存。
只算不存的话 `lastFedAt` 永远停在原地，同一段时间会被重复衰减：
先算出「过了 12 小时，掉 2 点」渲染出去，下次进来 `now - lastFedAt` 变成 18 小时，
又从存档里那个没动过的 `fullness` 掉 3 点。这条写在 `pet.js` 的 `onShow` 注释里。

页面的三个写操作都过 `commit(next)`，它先比对象同一性：

```js
if (next === this.save) return false; // 空写会白盖一次 updatedAt
```

## 对后续 feature 的影响

- **`REWARD`（P3-b）不受本轮影响。** 喂食消耗 `petFood`，兑换消耗 `medal`，两条路不交叉。
  勋章仍恒为 0，仍等 P5 / P6 的页面把 8 条核心 id 打满。
- **P5 要给经验加来源时，改 `checkAwardAndGrow` 的入参，不要在 `pet.js` 里按 `habitId` 分支。**
  线上数学打卡给 `{ exp: 8 }`，其它学习项各有差异。本轮三个来源（打卡 +5、喂食 +10、
  陪玩 +5）都是常量，届时给 `checkAwardAndGrow` 加一个「本次产出多少经验」的参数，
  由调用方（各学习页）决定。`pet.js` 认识 `habitId` 会让它反向依赖 `data/habits.js`。
- **P7 家长端改宠物名字要先解决 `choosePet` 覆盖 `name` 的问题。** 现在换形象等于换一只
  小伙伴，名字跟着 `PET_TYPES` 走。改过名再换形象会丢掉自定义名 —— 那时要么加一个
  「名字是否被自定义过」的标记，要么让改名与换形象互斥，两条都要人拍板。
- **首页宠物卡片仍是范围外。** 线上首页有一张（等级 + 经验条 + 两条状态），
  本轮宠物只在第二个 tab 里。加卡片要重排首页布局，与宠物规则无关，
  但它会引入一个新问题：首页也要结算饱腹度吗？本轮的答案是「看不见的地方不写存档」，
  加了卡片就得重新回答。
- **`pet.lastPlayedAt` 没有引入。** `docs/glossary.md` 里那一行现在明确标注了它没有存档字段
  （只钉命名，不是待办）。真要做开心度衰减，先回到 `doc.md` 的取舍表推翻结论，
  再加字段 —— 顺序不能颠倒。
