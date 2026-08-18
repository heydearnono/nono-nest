# 贴纸（140 张图鉴 + 加权抽取 + 每日一次免费）

- 区名：`STICKER`（贴纸表、抽取与权重、免费次数、图鉴）
- 模块：`miniprogram/data/stickers.js`、`miniprogram/utils/sticker.js`、
  `miniprogram/pages/sticker/`
- 状态：已完成（见 `summary.md`）。实现中类别筛选从 WXML 挪进了 JS
  （`wx:for` 套 `wx:if` 会给不显示的格子留空占位，五列网格立刻塌），
  其余设计与规格表一字未改地落地了
- 关联愿景：`docs/vision.md`「明确不做」的「不做付费抽卡」一条，
  以及「数据迁移」—— 本轮接的是**全仓最后两个线上顶层键**
- 顺带产出：顶层键 `stickerCollection` / `lastFreeStickerDate`
  （`SAVE-25` / `SAVE-26` / `IMPORT-22`）、奖励中心多一个入口按钮

## 背景

`docs/features/reward/doc.md`「范围外」第 1 条写明「**不做贴纸（`STICKER`）**。
140 张是一份与字库同量级的数据资产，还要给纯函数注入随机源、加一个收藏册页面 ——
够单独一轮」。本轮做这件事。

它同时是**数据搬迁的最后一步**。`docs/features/storage/doc.md` 从 P1 起维护一张
「线上有而本仓库不接」的名单，接到 P7 第三段只剩五个：`pointRules` / `rewardRules` /
`medalProgress` 三个已判成**永久不接**，剩下 `stickerCollection` 与 `lastFreeStickerDate`
挂着「贴纸单独一轮」。本轮之后那张名单上没有「以后再说」的条目了。

勋章此刻有两个消耗口里的一个（兑换三张卡）。贴纸是第二个，而且是**纯粹收集乐趣**那一类：
抽不到想要的没有惩罚、抽重了也是 `+1`。这与「什么算好」第 1 条（「我的进度在长」）
对得上 —— 图鉴的百分比是一条只会涨的线。

### 线上的贴纸系统（逆向自 `.scratch/index-VUOSJfWA.js`）

| 项       | 位置（字节偏移） | 线上做法                                                                |
| -------- | ---------------- | ----------------------------------------------------------------------- |
| 默认值   | `:243837`        | `stickerCollection: {}`、`lastFreeStickerDate: ''`                      |
| 日期键   | `:243929`        | `sr()` 给 `YYYY-MM-DD`，与本仓库 `dayKey` 同形                          |
| 贴纸表   | `:264485`        | `mo` 是 140 个四元组 `[emoji, name, category, rarity]`                  |
| id 生成  | `:269915`        | `` z(name, i) => `st-${String(i).padStart(3,'0')}-${name}` ``，运行时算 |
| 派生表   | `:269960`        | `B = mo.map(...)`、`ho = byId`、`go = 140`                              |
| 权重     | `:270106`        | `_o = { common: 55, uncommon: 30, rare: 15 }`                           |
| 抽取     | `:270141`        | `vo(collection)`：**只从没抽到的里抽**，抽空了才从全表抽                |
| 掉落装饰 | `:270420`        | `yo(n)`：`sort(() => Math.random() - .5)` 取 n 个 emoji 撒页面          |
| 标签     | `:270406`        | `bo` 六个类别中文、`xo` 三个稀有度中文、`So` 三套 CSS ring              |
| 持久化   | `:270742`        | `wo()` 白名单里两个键都在，整份写进 IndexedDB                           |
| 加载合并 | `:272796`        | `stickerCollection ?? 默认`，**元素不收敛**                             |
| 揭示水位 | `:274082`        | `stickerReveal`（弹窗数据）、`stickerDropTick`（掉落动画计数）          |
| 抽取动作 | `:282698`        | `drawSticker('free' \| 'medal')`，见下                                  |
| 页面     | `:677891`        | `pB()`「🎨 贴纸乐园」，**是奖励中心页里的一个 section**（`:685787`）    |

抽取的两条路径（`:282698`，原文压缩后重排）：

```js
drawSticker: (source) => {
  let today = sr();
  if (source === 'free') {
    if (state.lastFreeStickerDate === today) {
      toast('今天已经免费抽过啦');
      return;
    }
    state.lastFreeStickerDate = today;
  } else {
    if (state.currency.medals < 1) {
      toast('勋章不够哦');
      return;
    }
    --state.currency.medals;
  }
  let s = vo(state.stickerCollection),
    isNew = !state.stickerCollection[s.id];
  state.stickerCollection[s.id] = (state.stickerCollection[s.id] ?? 0) + 1;
  state.stickerReveal = { stickerId: s.id, isNew, duplicate: !isNew };
  state.stickerDropTick += 1;
};
```

加权抽取（`:270141`）：

```js
function vo(collection) {
  let unowned = B.filter((s) => !collection[s.id]);
  let pool = unowned.length > 0 ? unowned : B;
  let total = pool.reduce((a, s) => a + _o[s.rarity], 0),
    cursor = Math.random() * total;
  for (let s of pool) {
    cursor -= _o[s.rarity];
    if (cursor <= 0) return s;
  }
  return pool[pool.length - 1];
}
```

**逐条数过的事实**（`.scratch/stickers.tsv`，用脚本从 `mo` 抽出来数的，不是界面文案）：

| 项     | 值                                                                                   |
| ------ | ------------------------------------------------------------------------------------ |
| 条数   | **140**（界面上说「约 200 个贴纸」，与实际不符，以本表为准）                         |
| 类别   | 按段序：`animal` 32 / `food` 24 / `nature` 22 / `cute` 24 / `star` 18 / `fantasy` 20 |
| 稀有度 | `common` 84 / `uncommon` 37 / `rare` 19                                              |
| 排序   | 按类别聚成六段，分界下标 `0` / `32` / `56` / `78` / `102` / `120`                    |
| 名字   | 全是 2 ~ 3 个汉字，**140 个互不相同**，无空白字符                                    |
| emoji  | **140 个互不相同**                                                                   |
| id     | `st-000-小狗狗` ~ `st-139-彗星啦`，140 个互不相同                                    |

六段的分界与首条：`0` `🐶 小狗狗`（animal）、`32` `🍎 红苹果`（food）、
`56` `🌸 樱花瓣`（nature）、`78` `🎀 蝴蝶结`（cute）、`102` `💖 粉爱心`（star）、
`120` `🧚 小仙子`（fantasy，`rare`）。

线上这一块的问题里，五处直接决定了本轮的取舍：

1. **抽取扣勋章不进流水。** `--e.currency.medals` 一句就完了（`:282698`），
   而全勤的 `+1🏅` 是走流水的。这是本仓库那条不变式在线上的第二处破口
   （第一处是成就解锁的勋章，见 `docs/features/reward/doc.md`）。
2. **id 是从数组下标算出来的。** `z(name, i)`（`:269915`）吃下标，
   而 `stickerCollection` 的键就是这些 id。**给 `mo` 排一次序，
   历史收藏册的每一个键都会静默对不上** —— 140 张全变成「没抽到」，而没有任何报错。
3. **收藏册的值可能是 `0`。** 页面用 `Object.keys(e).filter(t => e[t] > 0).length`
   数收藏数（`:677950`），说明线上自己也承认这一点。加载时 `stickerCollection ?? 默认`
   整份透传、元素不收敛（`:272796`），所以脏值进来就一直在。
4. **掉落装饰用的是有偏的洗牌。** `sort(() => Math.random() - .5)`（`:270420`）
   不是均匀排列，V8 对短数组几乎不动 —— 与 `docs/features/math/doc.md` 里
   `shuffleOptions` 那条已经写过的教训是同一个。
5. **「今天已经免费抽过啦」与「勋章不够哦」都只是 toast。** 两个按钮是
   `disabled` 的（`:679622`），所以那两句话在界面上走不到 —— 它们是死代码路径，
   而 `disabled` 掉的按钮不给理由（与本仓库「点了要给出为什么不能」相反）。

## 设计

### `data/stickers.js`：140 条，**id 写死**

元素结构：

```js
{ id: 'st-000-小狗狗', emoji: '🐶', name: '小狗狗', category: 'animal', rarity: 'common' }
```

字段值一字不改（emoji / name / category / rarity 全部照搬），**但 `id` 从「运行时由下标算」
改成「写死在字面量里」**。理由不是口味：`data/` 是常量区，
「只 `export` 数组或对象字面量，不含任何函数、判断、计算」（`AGENTS.md` 第 3 节）——
`padStart` 是计算，不能出现在这一层。

这条约束顺带修掉了线上缺陷 2。id 写死之后：

- 重排数组**不再改 id**，历史 `stickerCollection` 的键永远对得上；
- 「顺序是规格」这句话仍然成立，但**理由变了** —— 从「id 由下标算出」变成
  「图鉴按这个顺序分六段显示」。前者是**不重排就不出事**，后者是**重排只是显示变了**。

与 `data/characters.js` / `data/poems.js` 的「顺序即规格」相比，本份是三者里
**最弱**的那一条：那两份的顺序是教学序列（先学哪个字、先背哪首诗），
本份只是图鉴的排版。所以头注释里要写清楚这个差别，不要让下一个人以为它同样不可动。

`id` 里嵌着中文名，看着别扭，**不改**：`stickerCollection` 的键在线上已经是这个形状，
换成 `st-000` 就要在导入时做一次键改写，而那需要一张 140 行的映射表 ——
一张只为了好看的映射表。

### `utils/sticker.js`：一个读、一个写

```js
stickerState(save, key)                    -> { items, owned, total, percent, categories, free, medal }
drawSticker(save, key, source, now)        -> { save, sticker, isNew, reason }
```

`stickerState` **不吃 `now`**：它要判断的只有「今天免费抽过没有」，
而那是 `lastFreeStickerDate === key` 一个字符串比较。与 `parentTasks(save)` 同一条 ——
不需要的参数不加（加了就会有人以为它在算什么与时刻有关的东西）。

`drawSticker` 返回**四元组**，与 `utils/parent.js::verifyPin` 的
`{ ok, save, reason }` 同形。理由一样：抽不动（今天免费抽过了、勋章不够）是
**正常用户状态**而不是非法入参，所以给原因码而不是抛错（`AGENTS.md` 第 5 节第 6 条），
而页面还要知道抽到了哪一张才能弹揭示层。抽不动时 `save` 是**入参本身**
（对象同一性）、`sticker` 为 `null`。

`reason` 三取值：`null`（抽到了）/ `'freeUsed'`（今天的免费抽用过了）/
`'noMedal'`（勋章不够）。**不是文案** —— 页面照原因码选那句话（与 `coreWarn` 同一条）。

### 随机源：**不注入，用种子现算**

`utils/` 不读 `Date.now()`，同一条也不读 `Math.random()`（`AGENTS.md` 第 3 节）。
线上的 `vo()` 内联调 `Math.random()`，所以这一条必须换掉。三个候选摆出来过：

| 候选               | 做法                                     | 代价                                                           |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------- |
| 页面传 `random()`  | `drawSticker(save, key, src, now, rand)` | 多一个参数，每条测试都要给假函数，还要拍板「传了坏函数怎么办」 |
| 页面传一个 `nonce` | 种子吃 `key` 与 `nonce`                  | 与下一条等价，只是把序号的来源换成页面                         |
| **种子现算**       | 种子吃 `key` 与**已抽总次数**            | 同一份存档同一天的第 N 次抽必然是同一张                        |

**选第三个**，与 `utils/math.js::shuffleSeed`（`miniprogram/utils/math.js:194`）
同一条先例 —— 那里也是「不用 `Math.random()`，种子只吃日期键与题 id」。

```js
seed = fnv1a(`${key}|${已抽总次数}`); // 已抽总次数 = Object.values(收藏册) 求和
```

**已抽总次数是现算的，不落新字段。** 收藏册本身就记着每张抽到过几次，求和就是抽过几次 ——
再存一个计数器等于同一笔数据两个来源（`docs/features/reward/doc.md` 里
「进度每次现算，不存」同一条）。

代价写清楚：**同一份存档、同一天、第 N 次抽，抽到的必然是同一张**。这在界面上观测不到 ——
抽取是不可撤销的写入，孩子抽完第 N 次就只能抽第 N+1 次，没有「回到抽之前再抽一次」
这条路径。而它在测试里是白拿的好处：**一条都不用打桩，直接断言落了哪张**。

免费抽与勋章抽**共享同一个序号**，所以同一天同一个序号下两种来源给同一张。
同理观测不到（花什么与抽到什么是两件事，而序号只由抽过几次决定）。

### 加权抽取：与线上等价，但用整数

```js
const RARITY_WEIGHT = { common: 55, uncommon: 30, rare: 15 };

const pool = 未拥有的.length > 0 ? 未拥有的 : 全表; // 与线上同：先把没抽到的抽完
const total = pool.reduce((sum, s) => sum + RARITY_WEIGHT[s.rarity], 0);
let roll = Math.floor((lcgNext(seed) / 2 ** 32) * total); // 0 ~ total-1 的整数
for (const s of pool) {
  roll -= RARITY_WEIGHT[s.rarity];
  if (roll < 0) return s;
}
```

三处与线上的写法差异，都不改行为只改可靠性：

1. **`Math.random()` 换成线性同余取高位。** 与 `shuffleOptions`
   （`miniprogram/utils/math.js:221`）同一组参数、同一条「取高位不取低位」的理由 ——
   模 2³² 的 LCG 低位周期极短。
2. **整数 `roll` 而不是浮点 `cursor`。** 线上 `cursor -= w` 连减 140 次，
   最后一步可能因累积误差落到 `return pool[pool.length - 1]` 那个兜底分支上；
   整数减法没有这个问题，兜底分支于是**只在 `pool` 为空时才可能走到**（而它不会为空）。
3. **判 `roll < 0` 而不是 `cursor <= 0`。** `roll` 从 `0` 起，
   第一条权重 55 的贴纸要吃掉 `0 ~ 54` 这 55 个值 —— 判 `<= 0` 会让它只吃掉 `0` 一个。

**只从未拥有的里抽**这一条**保留**，是线上少见的一处好设计：前 140 次必不重复，
「图鉴在长」这件事不会被运气卡住。抽满之后才允许重复（`count` 加一）。

权重在满池上的实际分布（84 / 37 / 19 条 × 55 / 30 / 15）：
`common` 4620 / `uncommon` 1110 / `rare` 285，合计 6015 —— 也就是
**76.8% / 18.5% / 4.7%**。19 张超稀有的每一张单看是 `15/6015 ≈ 0.25%`，
而池子会随着抽到的变小，所以最后剩下的一批必然是超稀有 —— 这与「只从未拥有的里抽」
是同一件事的两面。

### 勋章抽走 `postLedger`，免费抽一分不动

```js
// source === 'medal'
next = postLedger(next, key, 'spend', { medal: 1 }, `抽贴纸：${sticker.name}`, now);
```

修掉线上缺陷 1。理由是 `utils/point.js` 的那条不变式：
「**`save.currency` 只可能被 `point.js` 改**，而它每次改都追加一条流水」。
本轮是这条不变式的**第八个执行点**（打卡、取消、全勤、周奖励、兑换、成就、驳回退款
七处已有，本轮加抽贴纸）。**流水的 `reason` 带贴纸名字**，家长在报告里能看见勋章花在哪儿了。

**免费抽不动货币、不加流水**，只把 `lastFreeStickerDate` 推到今天。
与 `resolveRedemption` 的 `'done'` 那条同形：一次纯粹的水位迁移。

顺序是**先抽后扣**：要先知道抽到哪一张，`reason` 里才有名字。抽不动的两个分支
在扣之前就 `return` 了入参，所以不存在「扣了勋章没抽到」的中间态。

### `lastFreeStickerDate`：第四个 `dayKey` 水位

```js
lastFreeStickerDate: '2026-08-17'; // 空串 = 从未免费抽过
```

与 `lastWeeklyBonusWeek`（周奖励）、`learningProgress.guoxue.weekly.weekKey`（本周三首）、
`learningProgress.math.stage`（阶段）同一类：**推不出来的水位才落盘**。
「今天免费抽过没有」推不出来 —— 收藏册里没有「哪一次是免费的」这笔数据，
而那也不必记（免费与勋章抽到的贴纸没有区别）。

收敛与 `lastWeeklyBonusWeek` 逐字相同：**只认日期键形状，其余落空串**（`SAVE-26`）。
落空串的后果是「今天可能再免费抽一次」，落一个乱码的后果是
「`'乱码' !== 今天` 恒成立 —— 每天都能抽，而且永远抽不完」。
两个方向的错都指向多给一次，所以这个收敛策略在这里比在周奖励那里更安全。

### `stickerCollection`：键存在即拥有

```js
stickerCollection: { 'st-000-小狗狗': 3, 'st-018-独角兽': 1 }
```

收敛（`SAVE-25`）：

- 非对象（数组 / `null` / 字符串）整份落 `{}`；
- 值收敛成**正整数**：`3.7` → `3`；
- **`0` / 负数 / 非数的键整条丢掉** —— 与 `days[].checks` 的墓碑同一条
  （`IMPORT-19`：「`completed !== true` 不写键」）。线上页面判 `> 0`
  说明它承认收藏册里可能有 `0`；本层把 `0` 丢掉之后，**读取侧一律判「键在不在」**，
  不再需要第二个判据。
- **未知 id 原样留着** —— 与 `rewardFlags` 同一条（`SAVE-23`）：本层零 import，
  认不出哪个 id 在 `data/stickers.js` 里登记过。删了就是丢数据，留着只是没人读；
  **忽略未知 id 的是 `stickerState` 的读取路径**（`STICKER-06`）。

「键存在即拥有」与 `HABIT` 区的「键存在即已打卡」是同一条纪律的第三次出现
（第二次是 `rewardFlags` 的「缺键 = 启用」的反面）。三处都是同一个判断：
**把「有没有」编码进键的存在性，而不是编码进值** —— 值只用来数「几次」。

### 导入：恒等映射，但**不是整份透传**

两个键都是**同名恒等映射**（`IMPORT-22`）：线上 `stickerCollection` 的形状
（`stickerId → 次数`）与本仓库一致，`lastFreeStickerDate` 的形状（`YYYY-MM-DD`）
也一致 —— 因为本仓库的 id 是照抄线上算出来的那一批，`dayKey` 与线上 `sr()` 同形。

但这**不是** P1 那种「整份透传」：元素收敛在 `normalizeSave` 里做，
所以一份带 `0` 值、带 `3.7`、带脏 id 的线上收藏册进来会被收拾干净。
`docs/features/storage/doc.md` 里那条「**一个键可以有映射而不收敛**」在这里是反面：
**一个键可以是恒等映射而仍然被收敛** —— 映射表管「叫什么」，`normalizeSave` 管「长什么样」，
两件事分开。

P7 第三段留下的那条规律是「整份透传的顶层键，规格只会断言到透传的那一层」。
本轮不重犯：`IMPORT-22` 断言的是**收敛之后的结果**（`0` 值那条被丢掉），
而不是「原样等于原样」。

### 页面：`pages/sticker/`，第 13 个 page

线上贴纸乐园是**奖励中心页里的一个 section**（`:685787` 挂在兑换卡与待确认之间）。
本仓库**拆成独立页面**，从奖励中心一个按钮跳进去。

判据**不是** P7 第三段那条（只读性）—— 抽贴纸是写入口。本轮的判据是
**两块界面共用多少数据**：奖励中心的四段（货币带、兑换卡、兑换记录、成就）
共用同一份勋章余额与同一份 `redemptions` / `achievements`，
而贴纸只共用**勋章余额一个数**。140 格网格 + 类别筛选 + 揭示层塞进去会让
`reward.wxml` 从 69 行长到 250 行以上，而它们之间没有一处要一起改。

**`app.json` 不加第五个 tab**（tabBar 仍是四格）。贴纸不是「每天要进去一次」那类事 ——
每天一次免费抽是个上限而不是任务，把它提成 tab 会让它看起来像每日任务。

页面结构：

- 页头：`已收集 N/140` + 图鉴百分比
- 两个按钮：`🎁 今日免费抽`（今天抽过了显示「明天再来」）/ `🏅 1 勋章抽`（带余额）
  —— **两个都不 `disabled`**：点了给出「为什么不能」（与奖励中心的兑换卡、
  宠物页的喂食按钮同一条）。线上把它们禁用掉，于是那两句提示成了死代码。
- 类别筛选：七个 chip（全部 + 六类），页面字段，不落盘
- 图鉴：五列网格，拥有的显示 emoji 与 `×N` 角标（`N > 1` 时）、超稀有加 `✨`；
  未拥有的显示 `❓`
- 揭示层：抽完弹一次，`🎉 新贴纸到手！` / `💫 又是它！`

**未拥有的格子显示 `❓` 而不是灰掉的 emoji。** 线上用
`opacity-20 grayscale`（`:678900`）—— 那仍然把 emoji 露出来了，
于是「图鉴」的悬念没有了：140 张一眼看完，抽取只是把它点亮。
`❓` 让「抽到才知道是什么」成立，而这正是收集的乐趣所在。
代价是家长问「还差哪些」时页面答不上来 —— 那不是这一页要回答的问题。

**掉落动画不做**（线上 `stickerDropTick` + `yo()` 撒 emoji）。与
`docs/features/reward/doc.md`「不做成就的弹层与动画」同一条：需要图片与动画层，
与「零二进制资源」冲突。揭示层用一个 WXSS 的 `transform` 缩放就够了。

### 本轮不触发首页 toast 的临界点

`docs/features/reward/summary.md:103` 记着一条警告：
「首页 toast 的四条分支已经排满。再加第五种产出（贴纸？）时，
`checkedTitle` 的链式三目要改成表驱动」。

**本轮不到那个临界点**：抽贴纸不在打卡路径上，`settleDay` / `checkAwardAndGrow`
一行都不改。贴纸不是打卡的产出，是勋章的**消耗**。那条警告仍然挂着，
留给真的往打卡里加第五种产出的那一轮。

## 行为规格

### 图鉴与两个按钮的状态（`STICKER`，读取入口的输出）

| Spec ID    | 输入                                                       | 期望输出                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STICKER-01 | 空存档 `stickerState`                                      | `total` 为 `140`、`owned` 为 `0`、`percent` 为 `0`；`items` 140 条，首条 id 是 `st-000-小狗狗`、末条是 `st-139-彗星啦`，全部 `owned: false`                                                                   |
| STICKER-02 | 同上                                                       | `categories` 七项（`all` + 六类），`all.total` 为 `140`，`animal` / `food` / `nature` / `cute` / `star` / `fantasy` 的 `total` 依次为 `32` / `24` / `22` / `24` / `18` / `20`（**按段序**，与图鉴的六段一致） |
| STICKER-03 | 收藏册 `{ 'st-000-小狗狗': 3, 'st-018-独角兽': 1 }`        | `owned` 为 `2`、`percent` 为 `1`（`round(2/140*100)`）；`st-000-小狗狗` 那条 `owned: true` / `count: 3`，`st-001-小猫咪` 那条 `count: 0`                                                                      |
| STICKER-04 | 同上                                                       | 每条带 `categoryLabel`（`animal` → `动物`）与 `rarityLabel`（`common` → `普通`、`uncommon` → `稀有`、`rare` → `超稀有`）—— 页面不映射文案                                                                     |
| STICKER-05 | `lastFreeStickerDate` 等于入参 `key` / 等于别的一天 / 空串 | `free.used` 依次为 `true` / `false` / `false`                                                                                                                                                                 |
| STICKER-06 | 收藏册 `{ zzz: 2, 'st-000-小狗狗': 1 }`                    | `owned` 为 `1`（未登记 id **不计入**）；`items` 里没有 `zzz` 这一条 —— 读取侧忽略未知 id，与 `REWARD-16` 同一条                                                                                               |
| STICKER-07 | `currency.medal` 为 `0` / 为 `1`                           | `medal.ready` 依次为 `false` / `true`，`medal.balance` 依次为 `0` / `1`                                                                                                                                       |

### 抽取（`STICKER`，断言存档里落了什么）

| Spec ID    | 输入                                                                               | 期望输出                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STICKER-08 | 空存档 `drawSticker(save, '2026-08-17', 'free', now)`                              | 收藏册多**一个**键、值为 `1`；`lastFreeStickerDate` 落 `'2026-08-17'`；**`currency` 四个数一个都没变、当天流水一行都没加**；返回 `isNew: true` / `reason: null` |
| STICKER-09 | 上一步的输出再 `'free'` 抽一次（同一天）                                           | **原样返回入参**（`toBe`）、`sticker` 为 `null`、`reason` 为 `'freeUsed'`；收藏册与 `lastFreeStickerDate` 都没变                                                |
| STICKER-10 | 上一步的存档换成第二天 `'free'` 抽                                                 | 抽到了（`reason` 为 `null`）、`lastFreeStickerDate` 落第二天                                                                                                    |
| STICKER-11 | `currency.medal` 为 `3` 的存档 `'medal'` 抽                                        | `currency.medal` 变 `2`，**且当天流水多一行** `{ type: 'spend', medal: 1, reason: '抽贴纸：<名字>' }`，`star` / `gem` / `petFood` 三项为 `0`                    |
| STICKER-12 | `currency.medal` 为 `0` 的存档 `'medal'` 抽                                        | **原样返回入参**（`toBe`）、`reason` 为 `'noMedal'`；`currency` 与收藏册都没变                                                                                  |
| STICKER-13 | 同 `STICKER-11`                                                                    | `lastFreeStickerDate` **没变** —— 勋章抽不消耗免费次数                                                                                                          |
| STICKER-14 | 139 张已拥有（缺 `st-139-彗星啦`）的存档抽一次                                     | 必定抽到 `st-139-彗星啦` —— 只从未拥有的里抽                                                                                                                    |
| STICKER-15 | 140 张全拥有的存档抽一次                                                           | 不抛错、不返回入参；某一张的 `count` 从 `1` 变 `2`，`isNew` 为 `false`；收藏册仍是 140 个键                                                                     |
| STICKER-16 | 同一份存档、同一个 `key`，`'free'` 抽两次（各自从同一份入参出发）                  | 两次抽到**同一张**（确定性）                                                                                                                                    |
| STICKER-17 | 空存档起，每次拿上一次的输出连抽 140 次（`key` 每次换一天）                        | 收藏册 140 个键、每个值都是 `1` —— 前 140 次不重复                                                                                                              |
| STICKER-18 | 只剩两张未拥有（一张 `common`、一张 `rare`）的存档，在 200 个不同 `key` 上各抽一次 | 抽到 `common` 的次数 **大于**抽到 `rare` 的两倍 —— 权重真的生效（均匀抽会是 1:1，比值 `55:15`）                                                                 |
| STICKER-19 | `source` 为 `'gem'` / `''` / `undefined`                                           | 抛 `RangeError`                                                                                                                                                 |
| STICKER-20 | `now` 为 `NaN` / `undefined` / `'x'`（`'medal'` 抽，勋章够）                       | 抛 `TypeError`                                                                                                                                                  |

### 本轮追加到 `SAVE` / `IMPORT` 区的规格

`SAVE-25` / `SAVE-26` / `IMPORT-22` 三条声明在 `docs/features/storage/doc.md` ——
它们是**存档结构与字段映射**，与两个顶层键同区同模块。本表不重复，
与 P6 的 `weekKeys` 归 `DAY` 区、P5 识字的 `learningProgress` 归 `SAVE` 区同一条分工。

`STICKER-06` 与 `SAVE-25` 是一对，**少了前者，一个只在收敛层丢未知 id 的实现也能全绿**——
而那个实现会丢数据（`rewardFlags` 当初就是为这件事定的「留着不删，读取侧忽略」）。
两条各断言一层：`SAVE-25` 断言脏 id **留在存档里**，`STICKER-06` 断言它**不出现在图鉴上**。

`STICKER-08` 与 `STICKER-11` 是一对，各挡一个方向：前者挡「免费抽也扣了勋章」，
后者挡「勋章抽直接改 `currency` 不走流水」（那正是线上缺陷 1 的形状 ——
只断言 `currency.medal` 变成 `2` 会让它全绿）。

`STICKER-14` 与 `STICKER-15` 是一对：少了后者，一个「抽空之后返回 `undefined`」
或者「抛错」的实现能过 `14`。第 141 次抽是**必然会到**的状态，不是边界。

`STICKER-17` 是不带具体数字的不变式规格：断言的不是「抽到了哪 140 张」
（那由种子决定，写进规格就把实现钉死了），而是「140 次之后一张不缺、一张不重」。

## 范围外

- **不做贴纸成就。** `ACHIEVEMENTS` 是十一条常量，加一条「收集 50 张」要动
  `ACHV` 区的规格表与 `data/achievements.js`。图鉴百分比本身就是进度条，
  不必再套一层勋章产出 —— 而且那会让「抽贴纸花勋章」变成「抽贴纸赚勋章」，
  消耗口变产出口。
- **不做掉落动画与粒子。** 线上 `stickerDropTick` + `yo()` 往页面上撒 emoji。
  与「不做成就的弹层与动画」同一条：需要图片与动画层，与「零二进制资源」冲突。
  揭示层只有一个 WXSS 缩放。
- **不做贴纸的「使用」。** 不能贴到宠物身上、不能设成头像、不能做壁纸。
  抽到就是收藏册里多一格，链条到此为止 —— 线上也是如此，而给它一个用处
  会把 `pet.unlockedDecor`（线上死字段）那条路重新打开。
- **不做家长端调权重与改免费次数。** `RARITY_WEIGHT` 与「每天一次」是常量，
  不进存档。与「不做家长端改奖励项与阈值」同一条判断：家长要调的是
  「一天该完成几项」，不是抽卡概率。
- **不做重复贴纸的折算。** 抽重了就是 `count + 1`，不换勋章、不换星光。
  折算要拍板「几张换一枚」，而那是一条会被反复调的数值 —— 且它让抽满之后的抽取
  变成一门生意。
- **不做贴纸的搜索与排序。** 140 格五列，一屏半，六个类别 chip 够了。
- **不改 `data/stickers.js` 的任何字段值。** 与 `data/characters.js` 那份
  「照搬不修」同一条 —— 140 个名字与 emoji 一字不动。
  唯一的偏离是 `id` 从派生改成写死（见设计），那是 `AGENTS.md` 第 3 节的要求，
  不是内容订正。
- **不接线上的 `stickerReveal` / `stickerDropTick`。** 两者都不在线上的持久化白名单里
  （`:270742`），是内存态的界面水位。本仓库的对应物是页面字段 `reveal`，不落盘 ——
  与 `parent.js` 的 `unlocked`、`board.js` 的 `tab` 同一条。
- **不做 tabBar 第五格。** 每天一次免费抽是上限不是任务（见设计）。
