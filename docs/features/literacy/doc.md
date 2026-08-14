# 识字（2000 字库 + 复习调度）

- 区名：`LITERACY`（字库、复习调度、识字打卡）
- 模块：`miniprogram/data/characters.js`、`miniprogram/utils/literacy.js`、
  `miniprogram/pages/literacy/`
- 状态：已完成（见 `summary.md`）。实现中把 `step` 的语义从「间隔表的下标」改成
  「连续答对的次数」（`0` ~ `7`），本文件已按新语义写；理由见 `summary.md`「与 doc.md 的偏差」
- 关联愿景：`docs/vision.md` P5 的第二段（识字），一轮做完
- 顺带产出：`utils/dayKey.js` 的 `dayKeyAfter`（`DAY-10` ~ `DAY-12`）、
  存档新增顶层键 `learningProgress`（`SAVE-13` / `IMPORT-11`）

## 背景

`docs/features/learning/doc.md` 把识字留成了灰格子（`page` 为空串），
理由是它要先把 2000 字搬进 `data/` 并移植复习调度。本轮做这两件。

顺带填掉 P3-b 的最后一个缺口：`literacy` 是今日全勤那 8 条核心 id 里
**唯一还没有打卡入口**的一条（`brush-am` / `wake` 在 P2，`reading` 在 P5 首段，
`exercise` / `vegetables` / `poop` / `bath` 在 P6）。这一轮之后 8 条全部可打。

### 线上的字库

`characters--34XV0qT.js` 是纯数据包，零逻辑（整个文件除 JSON 外只有 41 字节：
`var e=JSON.parse(\`…\`);export{e as default}`）。逐条数过的事实：

| 项          | 值                                                                      |
| ----------- | ----------------------------------------------------------------------- |
| 条数        | **2000**，且 2000 个字**互不重复**                                      |
| 字段        | `char` `pinyin` `words` `sentence` `emoji`，五个字段每条都有            |
| 拼音        | 2000/2000 全有，带调号 NFC 预组合                                       |
| 组词        | `words` 有 1111 条是空数组，非空的共 1717 个词                          |
| 例句        | `sentence` 有 1107 条是空串；699 条是 `我会读「words[0]」。` 模板       |
| 笔画 / 部首 | **没有**。整个数据包只有那五个键                                        |
| 排序        | 前 415 条按**字频**降序（的 一 是 在 不 了 有 和 人 这…），其后按拼音序 |
| `emoji`     | 只有 15 种取值，且 `emoji === palette[下标 % 15]` 对全部 2000 条成立    |

**顺序本身是规格。** 前 415 条是字频序，也就是「先学最常见的字」；第 415 条起转成拼音序。
`data/characters.js` 里**不许排序、不许去重、不许按拼音统一整理** —— 那会毁掉教学序列。
415 这个分界点在本文件与 `data/characters.js` 的头注释里各记一次。

### 线上的复习调度（逆向自 `index-VUOSJfWA.js`）

线上把识字进度摊成**五个平行结构**：

```js
literacy: { learnedChars: [], reviewChars: [], masteredChars: [],
            charReviewSchedule: {}, charWrongCounts: {} }
```

调度的三个常量与两个函数：

```js
var eo = [1, 2, 4, 7, 14, 30],
  to = [0, 1, 2, 4, 7, 14]; // 正确 / 错误的间隔表（天）
function co(now, wrong) {
  let n = dayIndex(now);
  return (wrong ? to : eo).map((d) => dayKey(n + d));
}
function so(schedule, now) {
  let t = dayKey(now);
  return Object.entries(schedule)
    .filter(([, ds]) => ds.some((d) => d <= t))
    .map(([c]) => c);
}
```

一次评分把**六个到期日一次性全写进去**，而到期判定是 `some(d <= 今天)` ——
所以最早那个元素永远说话，**实际间隔恒为 1 天**，`2/4/7/14/30` 从不产生间隔，
只让优先级分数（`elapsed*12 + wrong*8 + …`）随时间变大。已在真实 2000 字语料上
模拟 12 天验证过：答对的字第二天照样回到复习队列，而且再也出不去。

其余逐条核对过的线上事实与问题：

| 项             | 线上做法                                                                       |
| -------------- | ------------------------------------------------------------------------------ |
| 掌握判定       | **一次「我认识」即 `masteredChars`**，无连对次数、无间隔表要求                 |
| 掌握可退回     | 不可。`masteredChars` 全仓只有 `push`，没有一处 `filter`                       |
| 每日新字       | 2（`for(let e=0;e<2…)` 的循环上限，界面也写 `今日新字 N/2`）                   |
| 新字取法       | `dayIndex(now)*2 % 池长` 起步、步长 2 —— 空存档在 2026-08-12 给的是「木 / 牧」 |
| 复习队列上限   | `slice(0, 8)`                                                                  |
| 新旧混排       | 不混。两个 tab，孩子自己切                                                     |
| 打卡条件       | 当天答对的**新字**满 2 个（`n.length>=2`），复习多少个都不算                   |
| 发放           | `pointRules.learning` 的 `stars:2 / foodPoints:2`，宠物经验 `exp: 8`           |
| `learnedChars` | **死字段**：只有 push，全仓无一处读取。50 字勋章读的是 `masteredChars`         |
| 答错的副作用   | 只 `push` 进 `reviewChars` 并 `+1` 错误数，**不推进卡片、不算打卡**            |
| 错误数递减     | 一次答对**减两次**：复习中的字同时在 `mastered` 与 `reviewed` 两个循环里       |
| 一个字答两次   | 没有防护，重复评分会重写调度并再减一次错误数                                   |

## 设计

### 一张表，不是五个平行结构

```js
save.learningProgress.literacy.chars = {
  的: { step: 2, due: '2026-08-16', wrong: 1 },
};
```

线上那五个结构是它三个 bug 的根源：`mastered` 与 `wrong` 两个列表可以同时含同一个字、
`learnedChars` 写了没人读、错误数被两个循环各减一次。**一个字一条记录，三个字段**：

- `step` —— 连续答对的次数，`0` ~ `7`。`1` ~ `6` 各对应间隔表的一档（答对第 N 次之后
  等 `REVIEW_STEPS[N-1]` 天），`7` 表示已掌握；`0` 是「上次答错了，今天重来」。
- `due` —— 下次出现的日期键（`'YYYY-MM-DD'`）。已掌握的字是空串，永不再出现。
- `wrong` —— 累计答错次数，只用来给同一天到期的字排先后（glossary 的「提高出现频次」）。

四个状态因此都是**从这一条记录推出来的**，不是另外存的：

| glossary 状态 | 判据                          |
| ------------- | ----------------------------- |
| `unseen`      | `chars` 里没有这个键          |
| `learning`    | 有键且 `step < 7`             |
| `mastered`    | 有键且 `step === 7`           |
| `wrong`       | `wrong > 0`（与上面三个正交） |

「已掌握」与「错过」在线上是两个可以同时成立的列表 —— 这里 `wrong` 是计数而不是状态，
所以不会出现「一个字既已掌握又待复习」。

### 复习间隔：修成真的间隔，不照搬

**偏离线上，这是本轮最大的一处。** 存的是**一个**到期日加一个档位，不是六个日期：

```js
const REVIEW_STEPS = [1, 2, 4, 7, 14, 30]; // 天，抄线上的数字
```

- 答对：`step + 1`，`due = dayKeyAfter(now, REVIEW_STEPS[新 step - 1])` ——
  第一次答对等 `1` 天，第二次等 `2` 天，依此类推。
  走完 `30` 那一档（`step` 从 `6` 变成 `7`）就是**已掌握**，`due` 置空。
- 答错：`step` 回 `0`，`due = dayKeyAfter(now, 0)`（也就是今天），`wrong + 1`。

`step` 是「连着答对了几次」而不是「间隔表的下标」，这样 `0` 就有了单独的含义
（答错过、今天重来），不必再拿一个字段区分「刚学的」与「刚答错的」。
档位与天数因此差一位：`step` 为 `1` 时等 `REVIEW_STEPS[0]` 天。

照搬线上（六个日期 + `some(d <= today)`）的代价不是「不够优雅」，是**功能不成立**：
每个学过的字每天都回到队列，而队列上限是 8，学到第 20 个字以后老字就再也轮不到 ——
「复习」这件事在 2000 字的语料上会自己失效。间隔表的那六个数字本身抄线上，
改的只是「让它们真的当间隔用」。

这条偏离顺带让 glossary 的四个状态都用得上：照搬线上的话 `learning` 永远是空的
（一次答对直接 `mastered`），而 glossary 早就把这套「学 → 复习 → 掌握」的词定好了。

### 掌握判定：熬过间隔表，不是一次答对

线上一次「我认识」就永久掌握，所以「已掌握 N 字」与 50 字勋章数的是「今天点过一次的字」。
本仓库要求**六个间隔各熬一遍、跨越 1 + 2 + 4 + 7 + 14 + 30 = 58 天**才算掌握 ——
六个间隔把七次答对隔开（`step` 从 `1` 走到 `7`），中间任何一次答错回到 `step: 0`，重新熬。

代价是「已掌握」这个数字涨得很慢（最快 58 天后才出现第一个）。收益是它是真的：
`ACHV` 区将来那个 50 字勋章数的是真认识的字，而不是点过的字。
界面上因此显示两个数：**学过 N 字**（`chars` 的键数）与**已掌握 N 字**（`step === 7`）——
前者天天涨，是给孩子看的；后者慢，是给家长看的。

**已掌握不退回。** 不是因为线上不退回，而是因为这条路径走不到：掌握的字不再进任何队列，
没有入口能对它答错。真要重学，那是家长端（P7）的事。

### 每天两个新字：按语料顺序从头

线上是 `dayIndex(now)*2 % 池长`、步长 2 —— 同一天重开给同一对（这一点是对的），
但起点在语料中段：空存档在 2026-08-12 给出的是下标 1354 的「木」与「牧」，
而不是字频最高的「的」「一」。5 岁孩子的第一天应该学「的」还是「木」，
这不是随机数该决定的事。

本仓库取**未学过的字里语料顺序最前的两个**。前 415 条是字频降序，所以「先学最常见的字」
这件事由数据包的顺序保证，调度层不需要知道字频。

于是不再需要「同一天给同一对」的确定性 —— 池子只会因为学了字而缩短，
而学过的字不会再回到新字池。今天没答完的那个新字，明天还是它。
（线上因为起点跟着 `dayIndex` 跳，昨天没答完的新字会被永久跳过，直到池子转一圈回来。）

### 一个字一天只评一次

线上没有这个防护：同一张卡片重复点「我认识」会再推进一次调度、再减一次错误数。
本仓库把「今天评过哪些字」记在当天的记录里，评过的字**当天不再出现在任何队列**，
再次评分**原样返回**（对象同一性，与 `completeLearning` / `feed` 同构）。

这条同时解决了答错的循环：答错的字 `due` 是今天，不拦的话它会在同一次会话里
一直回到队列顶上。拦掉之后「答错的字明天第一个出现」，这才是「提高出现频次」的本意。

### 当天记录长出 `learning.literacy`

```js
days['2026-08-12'] = {
  checks: { literacy: { at: 1754… } },      // HABIT 区
  ledger: [ … ],                             // POINT 区
  learning: {
    literacy: { newChars: ['的', '一'], reviewed: ['天', '木'] },
  },
}
```

`days[key].learning` 是 `LEARN` 区已经定下的兄弟键，本轮在它下面加 `literacy` 一项。
两个列表的分工：`newChars` 是当天**新学**的字（打卡的分子），`reviewed` 是当天**复习**过的字。
答错的字也进对应的那个列表 —— 它记的是「今天评过」，不是「今天答对了」，
因为它要挡住重复评分（见上一节）。

线上也有这个结构，但它的 `reviewedChars` 与 `mastered` 两项**全仓只有写、没有读**。
本仓库只留两项，且两项都有读取点（打卡分子 + 当天去重）。

### 跨天进度落在新的顶层键 `learningProgress`

`docs/features/learning/doc.md`「范围外」写的是「不做 `learningProgress` 顶层键 ……
识字 / 国学 / 数学的复习调度确实需要跨天的累计状态，届时由它们各自的 feature 定义存档结构」。
本轮就是那个「届时」：

```js
learningProgress: {
  literacy: {
    chars: {
    }
  }
}
```

只加 `literacy` 一个子键。国学与数学各自一轮时在同一个顶层键下加自己那份，
不再新增顶层键。**这与 `days` 里的 `learning` 是两回事**：`save.learningProgress.literacy`
是跨天的调度状态，`save.days[key].learning.literacy` 是当天做了什么 ——
一个是「这个字学到哪一档了」，一个是「今天评了哪些字」。

存档层因此要动：`SAVE-13` 钉默认值与收敛，`IMPORT-11` 钉线上五结构怎么映射成 `chars`。
顺序按 `AGENTS.md` 第 5 节第 2 条 —— 先改 `docs/features/storage/doc.md`。

### 导入线上进度：能推出档位就推，推不出的按学过算

线上没有档位，只有六个日期与三个列表。映射规则（`IMPORT-11`）：

| 线上状态                               | 导入后                                        |
| -------------------------------------- | --------------------------------------------- |
| 在 `masteredChars` 里                  | `step: 7`、`due: ''`（当成已掌握，不重新熬）  |
| 在 `charReviewSchedule` 里但未掌握     | `step: 0`、`due` 取那六个日期里**最早**的一个 |
| 只在 `reviewChars` / `learnedChars` 里 | `step: 0`、`due: ''`（立刻到期）              |
| `charWrongCounts[char]`                | 原样落进 `wrong`（收敛成非负整数）            |

`importOnlineSave(onlineJson)` **不收 `now`**（`IMPORT` 区既有签名），所以「立刻到期」
不能写成导入当天的日期键。写成空串即可：到期判定是 `due <= 今天` 的字符串比较，
而 `''` 小于任何日期键 —— **空串天然就是「立刻到期」**。
已掌握的字同样是空串，但它靠 `step === 7` 被排除在两个队列之外，两者不冲突。

**线上的「已掌握」直接认，不打回重学。** nono 在线上已经点过的字，导入后要是全部退回
`step: 0`，「已掌握」会从几百掉回 0 —— 违反「什么算好」第 2 条（不清零进度）。
代价是那批字的掌握是线上那套宽松判定给的，本仓库认下这笔历史账，只对**导入之后**
新学的字用新规则。这条取舍写在这里，不在代码注释里。

### `utils/dayKey.js` 加 `dayKeyAfter`

复习调度要算「N 天后是哪一天」。这是**时间原语**，与 P6 的 `weekKeys` 同一条判断：
它属于 `DAY` 区，不属于识字域 —— 古诗那一轮要的是同一个东西
（线上 `oo()` 与 `co()` 共用同一个 `dayIndex`）。

```js
dayKeyAfter(now, days) -> 'YYYY-MM-DD'
```

`days` 为 `0` 就是今天。实现上与 `weekKeys` 同一套：先把时刻锚到中午再 `setDate(+n)`，
所以夏令时切换那天加减一天不会跨到别的自然日；格式化仍复用 `dayKey`，不写第二套补零。

### `data/characters.js`：4 个字段，不搬 `emoji`

线上那个 `emoji` 字段**不是数据，是下标的函数** —— 已验证 `emoji === palette[i % 15]`
对 2000 条全部成立。搬进 `data/` 等于存 2000 份可以算出来的东西（多 29 KB），
而 `AGENTS.md` 第 3 节要求常量区「只 `export` 字面量，不含任何计算」。

所以 `data/characters.js` 导出两样：

```js
export const CHARACTERS = [{ char: '的', pinyin: 'de', words: ['我的', '好的', '真的'],
                             sentence: '这是我的小书包。' }, …];   // 2000 条
export const CHAR_EMOJI = ['🌸', '🌿', '⭐', '🍎', '🐰', '🌈', '🎈', '📚',
                           '🦋', '🌞', '🌙', '🏠', '🚗', '🎨', '🎵'];  // 15 个
```

`% 15` 那一步在 `utils/literacy.js` 里做，页面拿到的卡片上已经带着 `emoji`
（与 `healthState` 给 `poopIcons`、`READ_OPTIONS` 给页面渲染用值同一条分工）。

另外两处也不搬：线上 `JSON.parse(模板字符串)` 展开成真正的对象字面量（常量区不许有调用），
`export default` 改成具名 `CHARACTERS`（与 `LEARNING_MODULES` 一致）。
数据本身**一个字不改**：无转义、无插值，是无损的机械转写。

### 数据包的已知缺陷（不修，但要知道）

搬过来的 2000 条里：

- **1107 条没有例句**（55%），**1111 条没有组词**。所以卡片上「例句」与「组词」两行
  必须能缺失 —— 页面不给占位符，缺就不显示那一行。
- 699 条例句是 `我会读「X」。` 模板句，连着读很单调。真正原创的只有 194 条。
- 9 条多音字的 `pinyin` 与它在语料里的排序位置矛盾（`弹` 标 `tán` 却排在 `dàn` 的位置、
  `咳` 标 `hāi` 却排在 `ké` 的位置），说明拼音是后期单独填的，可能有错。
- 2 条例句里不含目标字（`日` → 「太阳像一个大火球。」）。

这些都**照搬不修**：它是线上用了很久的既有内容资产，改它等于分叉出第二份字库，
而 `docs/vision.md` 说内容资产「迁移时直接沿用，不重新收集」。
真要修，是家长端将来的内容编辑，不是这一轮的调度代码。

### `utils/literacy.js` 的两个纯函数

```js
literacyState(save, key, now) -> {
  newChars, reviewChars,          // 两个队列，卡片形状（含 emoji）
  todayNew, dailyNew,             // 今日新字 N/2
  learned, mastered, total,       // 学过 / 已掌握 / 2000
  done,                           // 今天这一格打过卡没有
}
gradeChar(save, key, char, known, now) -> save   // known: true 我认识 / false 还不太会
```

依赖方向 `literacy.js → pet.js → point.js → habit.js → data/`，与 `learning.js` 同层。

`gradeChar` 一个函数收两种评分，而不是 `knowChar` / `forgetChar` 两个：
两条路径的差别只有「`step` 往前一档还是回到 0」，其余（当天去重、写记录、够数就打卡）
完全相同 —— 拆成两个函数就要把那三件事抄两遍，与 `toggleHealth` / `setHealth`
按「布尔还是取值」分而不是按字段分是同一条判断。

`literacyState` **不抛错**（渲染路径宽容）：`habits` 里没有 `literacy` 任务时
`done` 为 `false`，存档里 `step` 是坏值时收敛。`gradeChar` 严格：
未登记的字抛 `RangeError`，没有对应任务抛 `RangeError`，`now` 非有限数抛 `TypeError`
（`AGENTS.md` 第 5 节第 6 条）。

### 打卡：新字满 2 个，语料学完后改判

抄线上：当天 `newChars` 满 `dailyNew`（2）个就打卡、发放、涨经验 8。
只复习不学新字**不打卡** —— 「每天 2 个新字」是这一格的定义。

但线上那条规则有个走不到头的尽头：2000 字全学过之后新字池是空的，
`newChars` 永远到不了 2，识字这一格**再也打不了卡**。所以补一条分支：
**没有新字可学时，复习完当天到期的全部字即打卡**。这一天在 2000 天之后，
但一行规格就能挡住一个永久死角，比留着它便宜。

发放走 `checkAwardAndGrow(save, key, habit.id, now, 8)`，与 `completeLearning` 同一条
（学习域五个模块都是 8 点经验）。**发放先行、记录后写** —— P6 的做法，
`day` 从发放后的存档里取，`checks` / `ledger` / `learning` 三个兄弟键就不可能互相覆盖。

### 页面

| 元素     | 内容                                                      |
| -------- | --------------------------------------------------------- |
| 顶部     | 「今日新字 N/2」+「学过 N 字 · 已掌握 N 字」              |
| 两个 tab | `🆕 新字 (n)` / `🔄 复习 (n)`，抄线上，孩子自己切，不混排 |
| 卡片     | 大字 + 拼音 + 组词（可缺）+ 例句（可缺）+ 右上角 emoji    |
| 两个按钮 | `我认识 ✅` / `还不太会 🔄`                               |
| 空态     | 两个队列都空时显示「今天的字都认完啦 🎉」                 |

`wx.navigateTo` 进来（不是 tab），所以取初值用 `onLoad` —— 与阅读 / 英语两个表单页一致。
但识字页每次评分都会改存档，所以评分后 `setData` 重渲染，不需要重进页面。

**不做语音跟读。** 线上有个「跟读」按钮（`threshold: .6`），但它在线上也只弹一句提示、
不影响调度。`docs/vision.md` 已写明第一期降级，P8 才评估 WechatSI。

## 行为规格

### 复习调度与识字打卡（`LITERACY`）

| Spec ID     | 输入                                                  | 期望输出                                                                    |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| LITERACY-01 | 空存档 `literacyState`                                | `newChars` 是语料前两条（`的` / `一`），`reviewChars` 空，`total` 为 `2000` |
| LITERACY-02 | 同上                                                  | 卡片带 `emoji`，取值为 `CHAR_EMOJI[下标 % 15]`（`的` → `🌸`）               |
| LITERACY-03 | `的` 已学过后 `literacyState`                         | `newChars` 变成 `一` 与 `是`（跳过学过的，仍按语料顺序取最前两个）          |
| LITERACY-04 | `gradeChar(save, key, '的', true, now)`               | `chars.的` 为 `{ step: 1, due: 明天, wrong: 0 }`，`learned` 为 `1`          |
| LITERACY-05 | 连续答对推进档位                                      | `due` 依次是 +1 / +2 / +4 / +7 / +14 / +30 天                               |
| LITERACY-06 | 第七次答对（六个间隔全熬过）                          | `step` 为 `7`、`due` 为空串，`mastered` 为 `1`                              |
| LITERACY-07 | 已掌握的字                                            | 既不在 `newChars` 也不在 `reviewChars` 里                                   |
| LITERACY-08 | `gradeChar(..., '的', false, now)`（答错）            | `step` 回 `0`、`due` 为**今天**、`wrong` 加 1                               |
| LITERACY-09 | 昨天答对的字，今天 `literacyState`                    | 出现在 `reviewChars` 里（`due <= 今天`，日期键字符串比较）                  |
| LITERACY-10 | `due` 在明天的字                                      | 不在 `reviewChars` 里                                                       |
| LITERACY-11 | 三个字同一天到期、`wrong` 分别为 `0` / `2` / `0`      | `reviewChars` 里 `wrong` 为 `2` 的排最前，其余按语料顺序                    |
| LITERACY-12 | 到期的字超过 8 个                                     | `reviewChars` 只给 8 条                                                     |
| LITERACY-13 | 同一个字当天第二次 `gradeChar`                        | 原样返回入参（对象同一性），调度与记录都不再变                              |
| LITERACY-14 | 当天答错的字                                          | 当天不再出现在 `reviewChars` 里（明天才回来）                               |
| LITERACY-15 | 当天新学第二个字                                      | `checks.literacy` 在位、`star` +2、`petFood` +2、流水 `完成：识字`          |
| LITERACY-16 | 同上                                                  | `petExp` +8（与 `LEARN-08` 同价，不是自律的 5），`mood` +1                  |
| LITERACY-17 | 当天新学第三个字（已打过卡）                          | 不重复发放，流水仍只有一条                                                  |
| LITERACY-18 | 当天只复习、没学新字                                  | 不打卡、不发放                                                              |
| LITERACY-19 | 打卡后 `days[key]`                                    | `checks` / `ledger` / `learning` 三个兄弟键同时在位，互不覆盖               |
| LITERACY-20 | 同上                                                  | `learning.literacy` 为 `{ newChars: [...], reviewed: [...] }`，答错的字也在 |
| LITERACY-21 | `gradeChar` 传不在字库里的字                          | 抛 `RangeError`                                                             |
| LITERACY-22 | `gradeChar` 的 `now` 非有限数                         | 抛 `TypeError`                                                              |
| LITERACY-23 | `habits` 里没有 `module === 'literacy'` 的任务        | `literacyState` 不抛（`done` 为 `false`），`gradeChar` 抛 `RangeError`      |
| LITERACY-24 | 存档里 `step` 为 `99` / `-1` / `'2'`，`wrong` 为 `-3` | 读取时收敛（`step` 夹到 `0`~`7`、`wrong` 夹到非负整数），不抛错             |
| LITERACY-25 | `gradeChar` 后检查入参 `save`                         | 未被改动（返回的是新对象）                                                  |
| LITERACY-26 | 语料全部学过、当天到期的字全部复习完                  | 打卡（没有新字可学时改判，挡住 2000 天后的死角）                            |

`LITERACY-05` 是本轮偏离线上最要紧的一条：线上六个日期一次性写入、`some(d <= today)`
判定，实际间隔恒为 1 天。没有这条规格，下一个人「按线上抄回去」不会有任何东西报警。

`LITERACY-13` 与 `LITERACY-14` 是一对：线上两条都没有，所以同一张卡片能重复评分、
答错的字能在同一次会话里一直回到队列顶上。

### 本轮追加到存储层的规格

`dayKeyAfter` 的三条（`DAY-10` ~ `DAY-12`）、`learningProgress` 的默认值（`SAVE-13`）
与线上五结构的导入映射（`IMPORT-11`）都声明在 `docs/features/storage/doc.md`，本表不重复 ——
与 P6 的 `weekKeys`（`DAY-06` ~ `DAY-09`）同一条分工：**原语与存档形状归 `SAVE` / `DAY` / `IMPORT` 区，
识字域只声明 `LITERACY-NN`。**

## 范围外

- ~~**不做国学与数学。**~~ 国学在 P5 第三轮做完（`docs/features/poem/doc.md`），
  **数学那一格仍是灰的**。古诗的调度确实**与识字不共用**（已核对线上：
  古诗按周轮换 3 首、到期上限 2、只在首次学习时写一次调度、没有错误计数），
  所以 `docs/glossary.md` 里「识字与古诗共用同一套调度」这句话已改成「共用同一套**术语**」。
  古诗那一轮用的是**同样的词、不同的档位表**：四档 `[1, 3, 7, 15]` 跨 26 天、
  `step` 上界 `5`，而识字是六档跨 58 天、上界 `7`。
- **不做笔画与笔顺。** 数据包里没有 `stroke` / `radical` 任何字段，硬做要另找数据源，
  而笔顺动画还要么是图片要么是 SVG 路径，与「零二进制资源」冲突。
- **不修数据包里的 1107 条空例句与 9 条拼音矛盾。** 见上文的取舍。
- **不做每日新字数可配。** `dailyNew` 是常量 2，不进 `parent` 设置 ——
  线上也没有这个开关（`parentSettings` 只有 `pin` / `dailyGoal` / `note`，
  而 `dailyGoal` 是任务条数不是字数）。真要可配，是 P7 的事。
- **不做已掌握的字重新学。** 掌握是终态，没有退回入口（理由见上文）。
- **不做取消识字打卡。** 与 `LEARN` 区一致：学习打卡不给撤回入口。
- **不做首页显示识字进度。** `dayProgress` 的分母仍只数 `category === 'habit'`。
- **不做语音跟读。** 线上那个按钮在线上也只弹提示。P8 才评估。
- **不做今日全勤与勋章。** `literacy` 打上了只是让 P3-b 的 8 条核心 id 齐了，
  全勤判定与勋章发放本身仍在 `POINT` 区，是 P3-b 的事。
- ~~**不做古诗那份 169 首的数据包。**~~ P5 第三轮搬完了（`data/poems.js`，
  见 `docs/features/poem/doc.md`）。
