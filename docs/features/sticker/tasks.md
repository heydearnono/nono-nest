# 贴纸（`STICKER`）· 实施清单

顺序按依赖：先存储层（两个顶层键的默认值、收敛、导入映射），再术语与既有文档，
再数据包，再纯函数与测试，最后页面与奖励中心那个入口按钮。

`sticker.js` import `data/stickers.js`（认 id 与稀有度）与 `point.js`（`postLedger`）；
**不 import `dayKey.js`**（日期键是入参，本模块一次都不算）；
**不 import `reward.js`**（勋章余额直接读 `save.currency.medal`，
`rewardState` 那份是兑换卡的事，需求不同 —— 与 `parentTasks.js` 不 import `habit.js` 同一条）。

## 1. 存储层先行（`AGENTS.md` 第 5 节第 2 条）

- [x] `docs/features/storage/doc.md`：存档结构块补两个顶层键，加
      「贴纸的两个键」一节（`stickerCollection` 的元素收敛 + `lastFreeStickerDate`
      的日期键形状）、`SAVE-25` / `SAVE-26` / `IMPORT-22` 三条规格
- [x] `docs/features/storage/doc.md`：映射表补两行（都是**同名恒等映射**，
      在「说明」列里写明「恒等映射但仍然收敛 —— 映射表管叫什么，
      `normalizeSave` 管长什么样」）
- [x] `docs/features/storage/doc.md:620`：那句「剩下**四个仍不接**」现在**是错的**
      （数字也错、内容也变了），改写成「剩下**三个永久不接**」并删掉
      「（贴纸单独一轮）」那个挂账
- [x] `docs/features/storage/doc.md:595`：「线上多出来的 8 个顶层键」那句要跟着改数字
- [x] `miniprogram/utils/save.js`：`defaultSave()` 补
      `stickerCollection: {}` 与 `lastFreeStickerDate: ''`
- [x] `normalizeSave()` 加 `stickerCollection` 的元素收敛（照 `rewardFlags()` 那个模子）：
      非对象整份落 `{}`、值取整并要求 `>= 1`、**`0` / 负数 / 非数的键整条丢掉**、
      **未知 id 原样留着**
- [x] `normalizeSave()` 加 `lastFreeStickerDate`：**逐字照抄 `lastWeeklyBonusWeek`
      那一行**（`DAY_KEY_RE.test` 否则落 `''`）
- [x] `save.js` 头注释写清两条：「`stickerCollection` 的键存在即拥有 ——
      值只用来数几次，所以 `0` 不是「拥有 0 张」而是脏数据」与
      「未知 id 原样留着，本层零 import 认不出谁登记过（与 `rewardFlags` 同一条）」
- [x] `miniprogram/utils/importOnline.js`：`mapped` 里加两个键的恒等映射，
      头注释的「不接」清单里**删掉**这两个（它们现在接了），
      并在「接」的那一侧写明「恒等映射 —— 因为本仓库的贴纸 id 是照抄线上
      由下标算出来的那一批，`dayKey` 与线上 `sr()` 同形」
- [x] `tests/save.test.js` 补 `SAVE-25` / `SAVE-26`
- [x] `tests/importOnline.test.js` 补 `IMPORT-22`，断言**收敛之后的结果**
      （fixture 里放一个 `0` 值的键、一个 `3.7`、一个脏 id，
      断言前两个不见了、脏 id 还在）—— 不写「原样等于原样」那种恒真规格
- [x] `ONLINE_EXPORT` fixture 补 `stickerCollection` 与 `lastFreeStickerDate`
      两个键（形状按 `.scratch/index-VUOSJfWA.js:243837` 核过）

## 2. 术语与既有文档

- [x] `docs/glossary.md`：贴纸一节补 `category`（六类）/ `rarity`（三档）/
      `stickerCollection`（收藏册，键存在即拥有）/ 免费抽（`free` 与 `medal`
      是 `source` 的两个取值）四条
- [x] `docs/glossary.md` 区名表：`STICKER` 那行的说明从「贴纸抽取、稀有度权重、
      免费次数」补成含图鉴（本轮的读取入口就是图鉴）
- [x] `docs/features/reward/doc.md:482`「不做贴纸（`STICKER`）」那条范围外
      改成划线 + 兑现说明（与第二段「不做家长端增删改任务」同一种改法）
- [x] `docs/features/reward/doc.md`：勋章的消耗口从「一个」改成「两个」
      （grep 一遍「唯一的消耗口」这类措辞）
- [x] `docs/vision.md`：P7 那一段末尾那句「`stickerCollection` /
      `lastFreeStickerDate` 是全仓最后两个没接的线上顶层键（贴纸单独一轮）」
      要跟着改 —— 本轮之后它们接了

## 3. `data/stickers.js`：140 条

- [x] 从 `.scratch/stickers.tsv` 生成 140 行，字段值一字不改，
      **`id` 写死在字面量里**（`st-000-小狗狗` ~ `st-139-彗星啦`）
- [x] 头注释：来源（线上 bundle `mo`，`:264485`）、
      「顺序是规格但**理由与 `characters.js` / `poems.js` 不同**」一段
      （那两份是教学序列，本份只是图鉴排版 —— 重排只是显示变了，不再改 id）
- [x] 头注释写明「**140 条，界面上那句「约 200 个贴纸」与实际不符**」
- [x] 头注释：常量区声明（`AGENTS.md` 第 3 节：零函数、零判断、零计算）——
      **id 之所以写死就是这一条要求的**，`padStart` 是计算
- [x] 另导出 `CATEGORY_LABEL` / `RARITY_LABEL` 两张字面量表
      （六类 + 三档中文，照搬线上 `bo` / `xo`，`:270406`）
- [x] 生成之后核一遍：140 条、六段分界下标 `0`/`32`/`56`/`78`/`102`/`120`、
      类别计数 `32/24/24/22/20/18`、稀有度计数 `84/37/19`、id 与 emoji 各自互不相同

## 4. `utils/sticker.js` 两个函数

- [x] `stickerState(save, key)`：`items` / `owned` / `total` / `percent` /
      `categories` / `free` / `medal` 七段，**不吃 `now`**
- [x] `items` 每条带 `owned` / `count` / `categoryLabel` / `rarityLabel`
      —— 页面一个文案都不映射
- [x] `owned` 只数**登记过的 id**（未知 id 忽略，`STICKER-06`）；
      `percent` 是 `Math.round(owned / 140 * 100)`
- [x] `categories` 七项（`all` + 六类），每项 `{ key, label, total, owned }`
- [x] `free.used` 是 `save.lastFreeStickerDate === key` 一个字符串比较；
      `medal` 给 `{ balance, ready }`（`ready` 是 `balance >= 1`）
- [x] `drawSticker(save, key, source, now)` 返回
      `{ save, sticker, isNew, reason }`；`source` 非 `'free'` / `'medal'`
      抛 `RangeError`，`now` 非有限数抛 `TypeError`
- [x] 抽不动的两个分支（`'freeUsed'` / `'noMedal'`）**原样返回入参**
      （对象同一性）、`sticker` 为 `null`
- [x] 种子：`fnv1a(\`${key}|${已抽总次数}\`)`，已抽总次数是
`Object.values(收藏册)`求和（**只算登记过的 id**，与`owned` 同一条），
      **不落新字段**
- [x] 加权抽取：`RARITY_WEIGHT = { common: 55, uncommon: 30, rare: 15 }`，
      **整数 `roll`**、判 `roll < 0`，LCG 取高位（与 `math.js:227` 同一组参数）
- [x] 只从未拥有的里抽；抽空了才从全表抽（不抛错、不返回入参）
- [x] 顺序**先抽后扣**：`'medal'` 走
      `postLedger(next, key, 'spend', { medal: 1 }, \`抽贴纸：${sticker.name}\`, now)`；
`'free'`只推`lastFreeStickerDate`，**货币一分不动、流水一行不加**
- [x] 头注释三段：随机源为什么不注入（三个候选与代价）、
      「同存档同天第 N 次恒定」这条代价为什么观测不到、
      与线上 `vo()` 的三处写法差异（`Math.random()` / 浮点累减 / `<= 0`）

## 5. 测试

- [x] 写 `tests/sticker.test.js`，覆盖 `STICKER-01` ~ `STICKER-20`
- [x] **一条桩都不打** —— 种子确定，直接断言落了哪张
- [x] `STICKER-08` / `STICKER-11` 是一对：前者断言**四个货币一个都没变、
      当天流水一行都没加**，后者断言**流水多了一行**且 `reason` 带贴纸名字
      （只断言 `currency.medal` 变成 `2` 会让线上缺陷 1 那种实现全绿）
- [x] `STICKER-06` 与 `SAVE-25` 各断言一层：脏 id 留在存档里 / 不出现在图鉴上
- [x] `STICKER-14` / `STICKER-15` 是一对：后者挡「抽空之后返回 `undefined` 或抛错」
- [x] `STICKER-17` 是不带具体数字的不变式规格：连抽 140 次一张不缺一张不重
      （**不写「抽到了哪 140 张」** —— 那会把种子实现钉死）
- [x] `STICKER-18` 造只剩两张（一 `common` 一 `rare`）的池子，
      在 200 个不同 `key` 上各抽一次，断言比值明显偏向 `common`
- [x] `STICKER-09` / `STICKER-12` 断言对象同一性（`toBe`）
- [x] 按 `AGENTS.md` 第 13 条：`stickerState` 的规格断言读取入口的输出，
      `drawSticker` 的规格断言存档里落了什么

## 6. 页面

- [x] `miniprogram/pages/sticker/` 四个文件（**第 13 个 page**，
      `app.json` 不加第五个 tab）
- [x] 页头：`已收集 N/140` + 图鉴百分比（三个数全来自 `stickerState`）
- [x] 两个按钮**都不 `disabled`**：点了照 `reason` 给「为什么不能」
      （`'freeUsed'` → 「今天的免费抽用过啦，明天再来」/
      `'noMedal'` → 「勋章不够，先去打卡赚一枚」）
- [x] 类别筛选七个 chip，`category` 是页面字段、不落盘
- [x] 图鉴五列网格：拥有的显示 emoji + `×N` 角标（`N > 1` 时）+ `rare` 加 `✨`；
      **未拥有的显示 `❓`**（不是灰掉的 emoji —— 悬念是收集的乐趣）
- [x] 揭示层：`reveal` 是页面字段、不落盘，`🎉 新贴纸到手！` / `💫 又是它！`，
      只有一个 WXSS `transform` 缩放，**不做掉落粒子**
- [x] 每次写入后 `if (next === this.save) return`，再落盘
- [x] `pages/reward/reward.wxml` / `.js`：加一个「🎨 贴纸乐园」入口按钮跳过去
      （**不在奖励中心里内联 140 格** —— 判据见 `doc.md`「页面」一节）
- [x] `app.json` 加 page

## 7. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、与线上的五处偏离
- [x] `docs/vision.md`：产品阶段表加一行（或挂在 P3-b 之后），
      并写明**数据搬迁到此完成** —— 那张「以后再说」的名单空了
- [x] 留档本次 prompt 到 `prompts/runs/`
