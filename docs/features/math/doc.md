# 数学（30 道题 + 六阶段 + Boss 通关）

- 区名：`MATH`（题库、每天三道的出题、阶段推进、数学打卡）
- 模块：`miniprogram/data/mathRounds.js`、`miniprogram/utils/math.js`、
  `miniprogram/pages/math/`
- 状态：已完成
- 关联愿景：`docs/vision.md` P5 的第四段（数学），一轮做完 —— **做完 P5 就完整了**
- 顺带产出：存档 `learningProgress` 下新增 `math` 子键（`SAVE-18` / `IMPORT-15`）、
  学习入口页的第四格从灰变亮（五格全亮）、修掉 `utils/reward.js` 里一处字段名对不上

## 背景

`docs/features/learning/doc.md` 把数学留成了灰格子（`page` 为空串），
「范围外」写明「数学仍是灰格子：它要 30 道题与六阶段升阶规则，单独一轮」。本轮做这件事。
做完之后 `docs/vision.md` 的 P5 五个子页全部落地。

`ACHV` 区的 `math-10` 成就此刻进度恒 `0`，与古诗那一轮的 `poem-10` 同一处境。
**但这一次不是「加个子键就自动亮」** —— `utils/reward.js` 的判据读的字段名在线上不存在，
本轮要顺带修掉，见下文「顺带修的一处缺陷」。

与前两轮（识字 2000 字、古诗 169 首）最大的不同：**数学的内容资产只有 30 道题**，
而且线上是**固定题目**、不是现算的题目生成器。所以本轮仍有一个 `data/` 数据包，
但它小得多（30 条），页面的渲染分支反而是三轮里最多的（五种题型）。

### 线上的题库（逆向自 `index-VUOSJfWA.js`）

数学的内容**不在单独的数据包里**，是 bundle 内的两个常量数组。逐条数过的事实：

| 项       | 值                                                                                |
| -------- | --------------------------------------------------------------------------------- |
| 阶段     | **6** 个，`stage` 1 ~ 6，各有 `name` 与 `desc`                                    |
| 题目     | **30** 道，每阶段整齐 5 道 = **4 普通 + 1 Boss**                                  |
| `id`     | `m<阶段>-1` ~ `m<阶段>-4` 与 `m<阶段>-boss`                                       |
| `kind`   | 五种：`count` 2 道 / `compare` 3 道 / `sort` 3 道 / `match` 4 道 / `choice` 18 道 |
| `isBoss` | 只有 6 道 Boss 有这个字段，普通题**没有这个键**                                   |
| 阶段内序 | Boss **不总是最后一条** —— 阶段 1 的 Boss 排在数组第三位                          |
| `answer` | 正确选项的下标；30 道里有 **20 道是 `1`**，阶段 4 与阶段 5 的十道题**全是 `1`**   |

六个阶段：

| `stage` | `name`     | `desc`             |
| ------- | ---------- | ------------------ |
| 1       | 数感       | 认识数量，比较多少 |
| 2       | 比较排序   | 从小到大，比大小   |
| 3       | 图形空间   | 认识图形与空间     |
| 4       | 10以内加减 | 10以内加减法       |
| 5       | 20以内加减 | 20以内加减法       |
| 6       | 钟表人民币 | 认识时间和钱币     |

五种 `kind` 各带自己的字段：`count` 有 `items`（一个 emoji）与 `target`（几个）；
`compare` 有 `leftSide` / `rightSide`（各 `label` / `items` / `count`）；
`sort` 有 `sequence`（乱序的数字数组）；`match` 与 `choice` 只有 `options`。

### 线上的出题与升阶

```js
learningProgress.math = { currentStage: 1, gamesCompleted: 0, stagePlayed: 0, stageCorrect: 0 };
```

两个函数：

```js
// 出题：当前阶段的普通题里，按天序号取连续两道，Boss 追加在末尾
function pickRounds(all, stage, d = new Date()) {
  const normal = all.filter((x) => x.stage === stage && !x.isBoss);
  const boss = all.find((x) => x.stage === stage && x.isBoss);
  if (normal.length === 0) {
    const fallback = all.filter((x) => x.stage <= stage && !x.isBoss).slice(0, 2);
    return boss ? [...fallback, boss] : fallback;
  }
  const start = dayNumber(d) % normal.length; // 4 道题、4 天一循环
  const out = [];
  for (let i = 0; i < Math.min(2, normal.length); i++)
    out.push(normal[(start + i) % normal.length]);
  if (boss) out.push(boss);
  return out; // 恒 3 道：两道普通 + Boss
}

// 升阶：本阶段答过 6 局且对了 4 局，且还没到第 6 阶段
function canAdvance(stage, correct, played) {
  return stage >= 6 ? false : played >= 6 && correct >= 4;
}
```

打卡在 `completeMathGame(correct)` 里：每答一题 `gamesCompleted += 1`、
`stagePlayed += 1`、答对再 `stageCorrect += 1`；够条件就 `currentStage + 1`
并把 `stagePlayed` / `stageCorrect` 清零；**答对且当天累计答过 ≥ 2 题**时打卡发放。

### 数据包与逻辑的已知缺陷

逐条核对下来，线上这个模块是五个学习子页里缺陷最多的一个。**十项**，分三类：

**判定错的（真的会判错）：**

1. **`m2-2` 的判定与题目相反。** 题目是「8、5、9 **从大到小**是？」，而 `sort` 的判定
   写成 `option === [...sequence].sort((a,b)=>a-b).join(',')` —— 恒按**升序**比。
   选项 `9,8,5` 标着 `answer: 0`（正确），但判定认的是升序串 `5,8,9`，也就是选项 1。
   **孩子选对答案会被判错。** 三道 `sort` 里只有这一道是降序题，所以只错这一道。
2. **`sort` 的 `answer` 字段是死字段。** 判定完全走字符串比较，从不读 `answer` ——
   于是 `m2-2` 的矛盾在代码层面无人仲裁。
3. **`count` 题不可能答错。** 判定是「点满 `target` 个就 `onAnswer(true)`」，
   点少了不结算、点多了也点不到（只渲染 `target` 个）。两道 `count` 题恒答对。
   `options` / `answer` 两个字段在 `count` 分支里**从不被读**。

**结构性可利用的：**

4. **「永远点第二个选项」是必胜策略。** 30 道里 20 道 `answer: 1`，
   阶段 4 与阶段 5 的十道题**全部** `answer: 1` —— 选项顺序是常量、不打乱。
5. **`gamesCompleted` 可以无限刷。** 它每答一题就 +1，没有当天上限、没有去重，
   而 `math-10` 成就的阈值是 10：连点十次同一道题就解锁。
6. **升阶只要「6 局对 4 局」，可以刷同两道题。** 当天题目恒 3 道且 4 天一循环，
   一天之内反复答同两道普通题就能凑够 `played >= 6 && correct >= 4`；
   `count` 题恒答对更让它变成纯点击。**答对过哪些题从不记录。**
7. **降阶不存在，但清零存在。** 升阶时 `stagePlayed` / `stageCorrect` 归零，
   于是「上个阶段答错很多次」这笔账在升阶那一刻消失 —— 没有回退，也没有累计。

**只影响显示的：**

8. **`stage` 是死字段。** 当天记录写 `learning.math = { gamesPlayed, gamesCorrect, stage }`，
   `stage` 全仓无一处读取。
9. **「今日 N 局」是 React `useState`，不是存档。** 页面一刷新就回 0，而
   `gamesCompleted` 又是累计的 —— 界面上那两个数字来自两个不同的时间尺度。
10. **升阶 toast 会被打卡 toast 覆盖。** 两条 `e.toast = ...` 在同一次
    `completeMathGame` 里先后赋值，同时发生时孩子只看到「数学打卡完成！+2⭐」，
    看不到「恭喜升级到「比较排序」阶段！」。

## 设计

### 四处偏离线上，四处都不是口味问题

| 项     | 线上                               | 本仓库                                    |
| ------ | ---------------------------------- | ----------------------------------------- |
| 出题   | 当前阶段按天序号取连续两道 + Boss  | **优先出还没答对过的题**，Boss 固定在末尾 |
| 打卡   | **答对**且当天累计 ≥ 2 题          | **当天三道题都答过**，答对答错都算        |
| 升阶   | 本阶段 6 局对 4 局（可刷同两道题） | **本阶段 5 道题每道都答对过一次**         |
| 选项序 | 常量顺序，「永远点第二个」必胜     | **按 `dayKey` 确定性打乱**                |

四条各自的理由：

**出题优先出还没答对过的题** —— 与古诗「顺序取未学的三首」、识字「取未学过的字」
逐字同构。线上按天序号取，于是「答对过」这件事对出题**完全没有影响**：
第 1 道题答对一百次，第二天照样出第 2 / 3 道。改成「优先没答对过的」之后出题与
升阶判据读的是**同一份记录**，孩子的进度看得见。Boss 仍固定在末尾（它是当天的收尾仪式）。

**打卡条件是「当天三道题都答过」，答对答错都算** —— 与识字「新字满 2（答对答错都算）」、
古诗「表过态就打卡」同一条。线上要求**答对**才计入打卡条件，于是答错要重答，
而 `count` 题恒答对让「重答」变成纯点击 —— 那不是练习，是刷。
诚实答错不该比乱点亏（`docs/vision.md`「什么算好」第 2 条）。
**配合当天去重，一道题一天只能答一次**，所以线上的无限刷在本仓库结构性不可能。

**升阶判据换成「这个阶段的 5 道题都答对过一次」** —— 线上的「6 局对 4 局」数的是
**次数**，本仓库数的是**哪些题**。一道记录 `{ correct, wrong }`，`correct` 为真即
「这道题会了」，语义与识字的 `mastered`、古诗的会背同一类。**没有降阶**（终态，与两轮一致）。
代价是升阶变慢：每阶段 5 道题、一天最多答 3 道且不重复，最快两天升一阶。

**选项顺序按 `dayKey` 确定性打乱** —— 这是本轮唯一一条线上完全没有的机制。
理由是「永远点第二个选项」在线上是**必胜策略**（阶段 4/5 十道题全是 `answer: 1`），
而那让整个模块的练习价值归零。打乱必须**确定性**（同一天同一道题的顺序恒定）：
否则页面每次 `setData` 重渲染选项就跳位，5 岁的孩子点不下去。
用 `dayKey` 当种子而不是 `Math.random()`，`utils/` 的纯函数纪律也才成立。

### `data/mathRounds.js`：30 道题，两个数组

```js
export const MATH_STAGES = [{ stage: 1, name: '数感', desc: '认识数量，比较多少' }, ...];  // 6 条
export const MATH_ROUNDS = [{ id: 'm1-1', stage: 1, kind: 'count', title: '数一数',
  question: '点一点有几个苹果？', items: '🍎', target: 3, options: ['2','3','4'], answer: 1 }, ...];
```

**两个数组都照搬，字段值一字不改** —— 与 `data/characters.js` / `data/poems.js`
同一条纪律。`isBoss` 只有 6 条 Boss 有，本仓库**给 30 条全部补上**（普通题落 `false`）：
线上靠 `!x.isBoss` 的 falsy 判断，而本仓库的 `data/` 要能被逐字段读，
「有的对象没这个键」会让每个读取点都写 `?? false`。这是**补齐**不是改值。

`m2-2` 的判定矛盾（缺陷 1）**改数据不改逻辑**：判定统一走 `answer` 下标比较
（不再有 `sort` 那条字符串比较的旁路），而 `m2-2` 的 `answer: 0` 指向 `9,8,5`
—— 与题目「从大到小」一致，本来就是对的。**所以数据一个字不改，缺陷随判定统一而消失。**
这与古诗那轮订正 `p68` 的 `dynasty` 不同：那是数据错了，这是判定错了。

`count` 题恒答对（缺陷 3）也在判定统一之后消失：`count` 的三个选项是数量，
孩子点选项而不是点 emoji，`answer` 于是真的说话。**代价是 `count` 与 `choice`
在本仓库的交互上没有区别** —— `items` / `target` 降级成「上面画几个苹果」的插图参数。
这是刻意的：让四道题真的能答错，比保留一种恒对的交互重要。

### 一道题一条记录，两个字段

```js
learningProgress.math = {
  rounds: { 'm1-1': { correct: true, wrong: 1 } },
  stage: 1,
};
```

`rounds` 一道题一条：`correct` 是「答对过没有」（布尔，终态）、`wrong` 是答错次数。
**没有 `step` / `due`** —— 数学**不做复习调度**，这是与识字、古诗最大的结构差别：
线上没有数学复习，而 30 道题一共只有 30 道，「明天再见」由「优先出没答对过的」
自然完成，不需要间隔表。`glossary.md` 的 `step` / `due` 两个词因此**不进这一域**，
`save.js` 也**不会有第三个上界常量**（`poem/summary.md` 预告过「数学若要复习调度，
是第三份」—— 结论是不要）。

`stage` 是**水位**（当前阶段，1 ~ 6），与 `guoxue.weekly`、`lastWeeklyBonusWeek` 同一类：
它可以从 `rounds` 推出来（连续满阶的最大阶段 + 1），但推出来的是「应该在第几阶段」，
而落盘的是「实际在第几阶段」。两者在正常路径上一致，落盘的意义是**升阶只发生一次** ——
升阶要弹一句「恭喜升级到『比较排序』阶段！」，而那句话不能每次读取都弹一遍。

线上四个字段的对照：`currentStage` → `stage`；`gamesCompleted` / `stagePlayed` /
`stageCorrect` **三个都不要** —— 它们数的是次数，而本仓库数的是哪些题
（`rounds` 的键与 `correct` 就够了，且不可刷）。

**`stage` 与 `rounds` 矛盾时以 `stage` 为准**（仲裁只有一条规则）：脏存档里
`stage: 6` 而 `rounds` 是空的，表现是「跳到最后一阶段」而不是抛错或打回第一阶段 ——
渲染路径宽容（`AGENTS.md` 第 5 节第 6 条）。反过来 `rounds` 满了而 `stage` 落后时，
下一次答题会推进它。

### `math_games` 判据读什么：顺带修的一处缺陷

`utils/reward.js:145` 现在写着：

```js
math_games: (save) => save.learningProgress?.math?.games ?? 0,
```

`learningProgress.math.games` **线上不存在**（线上是 `gamesCompleted`），
本仓库也从没有过这个字段 —— 它是古诗那一轮之前写下的一个凭空的名字，
因为进度恒 `0`，门禁与测试都没能发现。本轮定字段名，所以本轮修它：

```js
math_games: (save) => Object.values(save.learningProgress?.math?.rounds ?? {})
                        .filter((r) => r?.correct).length,
```

**数「答对过的题数」而不是「答题次数」** —— 与 `poems_mastered` 读存档上的
`mastered` 同一形状，而且它**不可刷**（线上那个字段连点十次就解锁，见缺陷 5）。
成就名叫「完成10次数学游戏」，阈值 10：30 道题里答对 10 道，走得到（最快四天）。

`reward.js` 因此**读的是 `rounds` 的元素**。这与古诗 `mastered` 那次的依赖分析
是同一条：`reward.js` 不能 import `math.js`（`math.js → pet.js → reward.js`，会成环），
所以判据必须从存档上直接读得出来。`correct` 是布尔、`rounds` 是一层对象，
`reward.js` 不需要知道六个阶段各有哪五道题 —— **判据不 import `data/mathRounds.js`**。

### 每天三道：两道普通 + Boss

`mathState` 给出的当天题目**恒 3 道**（抄线上的形状，界面文案「每天2题+Boss」
在 `data/learningModules.js` 里已经写着）：

1. 当前阶段的 4 道普通题里，**先取还没答对过的**，按数据包顺序；
2. 不够两道时（这个阶段的普通题都答对过了）用已答对过的补上，仍按数据包顺序 ——
   **不跨阶段借题**（线上的 `fallback` 分支跨阶段取，但那条分支永远走不到：
   每个阶段都有 4 道普通题，`normal.length === 0` 不可能成立，是死代码）；
3. Boss 追加在末尾，**永远第三道**。

当天已答过的题**不从列表里去掉**，而是标 `answered: true` 并让按钮失效 ——
去掉会让「第 3 题 / 共 3 题」的进度条在孩子眼前缩短。这与古诗
「当天表过态的诗不进 `reviews`」不同，理由是古诗有两段列表可以退场，
数学只有一段三道题的固定序列（`MATH-14`）。

### 选项按 `dayKey` 打乱

```js
// 种子只吃日期键与题目 id：同一天同一道题的顺序恒定，跨天变化
function shuffleSeed(key, id) {
  /* 逐字符累加的 32 位整数 */
}
```

打乱用**种子化的 Fisher-Yates**，不是 `sort(() => seed - 0.5)`（后者的结果不是
均匀分布，而且 V8 的排序稳定性会让短数组几乎不动）。给出的卡片带
`options`（打乱后的文案数组）与 `answerIndex`（正确项在打乱后的下标），
**页面不知道原始顺序** —— 页面只把点到的下标回传。

`answerIndex` 出现在**读取入口的输出**里，这意味着它在页面的 data 里可见。
这不是漏洞而是取舍：`AGENTS.md` 第 3 节要求判定在 `utils/`，而页面要在点击的
瞬间给出「太棒啦 ⭐ / 再试一次哦～」的反馈；把 `answerIndex` 藏起来就得让
每次点击都走一遍 `answerRound` 再落盘，答错也要写存档。5 岁的孩子不会去看
调试面板，而线上那份连打乱都没有。

### 当天记录长出 `learning.math`

```js
days['2026-08-14'].learning.math = { rounds: ['m1-1', 'm1-boss'], correct: 1 };
```

`rounds` 是**当天答过的题 id 数组**（与古诗那个 `poems: ['p1']` 同一形状，
不是线上那个只数次数的 `{ gamesPlayed, gamesCorrect, stage }`）：它有两个读取点 ——
打卡判据（满 3 道）与当天去重（一道题一天只能答一次）。`correct` 是当天答对几道，
只做显示。**线上那个死掉的 `stage` 字段不搬**（缺陷 8）。

打卡条件因此是 `rounds.length >= 3`，也就是「当天三道题都答过」。
它与「今日 N 局」那个 `useState`（缺陷 9）的差别是：这个数在存档里，刷新不丢。

### `utils/math.js` 的两个纯函数

与 `literacy.js` / `poem.js` 同构，一个读、一个写：

```js
mathState(save, key, now); // 读取入口，不抛错（渲染路径宽容）
answerRound(save, key, roundId, choice, now); // 答一道题，严格（编程错误抛错）
```

`mathState` 给出：

```js
{
  stage: { stage: 1, name: '数感', desc: '认识数量，比较多少',
           cleared: 1, total: 5 },        // 本阶段答对过几道 / 共几道
  rounds: [ /* 恒 3 张卡 */ ],
  todayCount: 1,                          // 当天答过几道（分母恒 3）
  solved: 7, total: 30,                   // 全局答对过几道
  done: false,                            // 今天打过卡没有
}
```

卡片字段：`id` / `stage` / `kind` / `title` / `question` / `items` / `target` /
`leftSide` / `rightSide` / `sequence` / `options`（打乱后）/ `answerIndex` /
`isBoss` / `correct`（历史上答对过）/ `wrong` / `answered`（今天答过了）。

`answerRound` 的严格边界（`AGENTS.md` 第 5 节第 6 条）：题 id 不在题库里抛
`RangeError`、`habits` 里没有数学任务抛 `RangeError`、`now` 非有限数抛 `TypeError`、
`choice` 不是整数下标抛 `RangeError`。当天已答过这道题时**原样返回入参**（对象同一性）。

**「刚升阶了没有」不在上面这张表里。** 它既不是存档字段、也不是 `mathState` 的输出：
放进 `mathState` 页面就得多存一个「上次的 stage」，而做成 `answerRound` 的第二个返回值
会让每个调用点都解构（`utils/` 的约定是「返回新存档」）。
**处置：`answerRound` 仍只返回存档，页面比较 `before.stage !== after.stage` 自己判断**
（页面已经持有两份存档，这是它唯一需要做的判断，`MATH-19` 钉住 `stage` 真的变了）。
升阶 toast 与打卡 toast 因此在页面层排队，不会互相覆盖（缺陷 10）。

### 页面

一屏三段：

| 段     | 内容                                                                     |
| ------ | ------------------------------------------------------------------------ |
| 顶部   | 「阶段 N/6 · 数感」+ `desc` + 「本阶段 1/5 · 今天 1/3」+ 今天打过卡的 ✅ |
| 题卡   | 一张（当天第一道没答过的题）：题干 + 插图 + 选项按钮；Boss 有金色描边    |
| 进度条 | 三个圆点（答对 / 答错 / 未答三种颜色）+ 六个阶段的胶囊（当前阶段高亮）   |

**一次只显示一道题**（线上也是），答完 1.5 秒后自动切到下一道；三道都答过时
整段换成空态「今天的三道题都做完啦 🎉」。

选项按钮的反馈：点对了显示「太棒啦！⭐」、点错了「再试一次哦～」——
**但两种都已经落盘、都算答过**，「再试一次」是明天再见的意思，不是当场重答
（与识字「还不太会」、古诗「还没背下来」同一条：答错不是惩罚）。
按钮不是灰色的否定按钮，五种题型的选项按钮一样大、一样是渐变色。

`onLoad` 取初值（`navigateTo` 进来，与其余四个子页一致），答题后 `setData` 重渲染、
落盘前判同一性。

## 行为规格

### 题库、出题、阶段与数学打卡（`MATH`）

| Spec ID | 输入                                                               | 期望输出                                                                                      |
| ------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| MATH-01 | `MATH_ROUNDS` / `MATH_STAGES`                                      | 30 条 / 6 条；每阶段 5 条（4 普通 + 1 Boss）；`id` 是 `m<阶段>-1`~`4` 与 `m<阶段>-boss`       |
| MATH-02 | 同上                                                               | 30 条都有 `isBoss` 键（普通题为 `false`）；`answer` 都是 `options` 的合法下标                 |
| MATH-03 | 空存档 `mathState`                                                 | `stage.stage` 为 `1`、`stage.name` 为 `数感`、`stage.cleared/total` 为 `0/5`、`solved` 为 `0` |
| MATH-04 | 同上                                                               | `rounds` 恒 3 张：`m1-1` / `m1-2` / `m1-boss`（Boss 永远最后一张）                            |
| MATH-05 | `m1-1` 已答对过（`correct: true`）                                 | `rounds` 变成 `m1-2` / `m1-3` / `m1-boss`（优先出没答对过的）                                 |
| MATH-06 | 本阶段 4 道普通题都答对过                                          | `rounds` 仍恒 3 张，用已答对过的按数据包顺序补（`m1-1` / `m1-2` / `m1-boss`），**不跨阶段**   |
| MATH-07 | 同一天两次 `mathState`                                             | 每张卡的 `options` 顺序相同（种子只吃 `key` 与题 id）                                         |
| MATH-08 | 相邻两天的 `mathState`（同一道题）                                 | `options` 顺序不同，且 `options[answerIndex]` 两天都是同一个文案（打乱不改答案）              |
| MATH-09 | 任一张卡                                                           | `options` 是原 `options` 的排列（同一个多重集），`answerIndex` 在合法范围内                   |
| MATH-10 | `answerRound(save, key, 'm1-1', 正确下标, now)`                    | `rounds['m1-1']` 为 `{ correct: true, wrong: 0 }`                                             |
| MATH-11 | `answerRound(..., 'm1-1', 错误下标, now)`                          | `rounds['m1-1']` 为 `{ correct: false, wrong: 1 }`，**照样算答过**                            |
| MATH-12 | 先答错、后一天答对同一道题                                         | `correct` 变 `true`，`wrong` 仍是 `1`（答对不清错误计数）                                     |
| MATH-13 | 已答对过的题再答错                                                 | `correct` 仍是 `true`（终态，不退回），`wrong` +1                                             |
| MATH-14 | 当天答过 `m1-1` 后 `mathState`                                     | `m1-1` 仍在 `rounds` 里且 `answered` 为 `true`（不从三道里去掉）                              |
| MATH-15 | 同一道题当天第二次 `answerRound`                                   | 原样返回入参（对象同一性），记录与货币都不再变                                                |
| MATH-16 | 本阶段 5 道题（含 Boss）都答对过一次                               | `stage` 推进到 `2`，`stage.name` 为 `比较排序`，`cleared/total` 回到 `0/5`                    |
| MATH-17 | 本阶段 4 道普通题答对、Boss 没答对                                 | `stage` 仍是 `1`（Boss 也算在 5 道里）                                                        |
| MATH-18 | 第 6 阶段 5 道题都答对过                                           | `stage` 停在 `6`，不会变成 `7`                                                                |
| MATH-19 | 升阶那一次 `answerRound` 前后的 `learningProgress.math.stage`      | 从 `1` 变成 `2`（页面靠这个差值弹升阶 toast，不写第二个存档字段）                             |
| MATH-20 | 当天答满 3 道题                                                    | `checks.math` 在位、`star` +2、`petFood` +2，流水 `完成：数学`                                |
| MATH-21 | 同上                                                               | `petExp` +8（与 `LEARN-08` 同价），`mood` +1                                                  |
| MATH-22 | 当天只答了 2 道题                                                  | 不打卡、不发放（`checks.math` 不在位）                                                        |
| MATH-23 | 当天 3 道题全答错                                                  | **照样打卡照样发放**（答对答错都算答过）                                                      |
| MATH-24 | 打卡后 `days[key]`                                                 | `checks` / `ledger` / `learning` 三个兄弟键同时在位，互不覆盖                                 |
| MATH-25 | 同上                                                               | `learning.math` 为 `{ rounds: [...], correct: N }`，答错的 id 也在 `rounds` 里                |
| MATH-26 | 当天答满 3 道之后（假设第 4 道也能答）                             | 不重复发放，流水仍只有一条                                                                    |
| MATH-27 | `answerRound` 传不在题库里的 `roundId`                             | 抛 `RangeError`                                                                               |
| MATH-28 | `answerRound` 的 `choice` 为 `-1` / `99` / `'0'` / `1.5`           | 抛 `RangeError`                                                                               |
| MATH-29 | `answerRound` 的 `now` 非有限数                                    | 抛 `TypeError`                                                                                |
| MATH-30 | `habits` 里没有 `module === 'math'` 的任务                         | `mathState` 不抛（`done` 为 `false`），`answerRound` 抛 `RangeError`                          |
| MATH-31 | 存档里 `stage` 为 `99` / `-1` / `'2'`、`rounds` 的 `wrong` 为 `-3` | 读取时收敛（`stage` 夹到 `1`~`6`、`wrong` 夹成 `0`），不抛错                                  |
| MATH-32 | 存档 `stage: 6` 而 `rounds` 为空（矛盾）                           | `mathState` 给第 6 阶段的题（以 `stage` 为准），不抛错、不打回第一阶段                        |
| MATH-33 | `rounds` 里有一个不在题库里的 id（脏数据）                         | `mathState` 不抛错，那条不进 `rounds`、也不算进 `solved`                                      |
| MATH-34 | `mathState` 的 `now` 非有限数                                      | 不抛错（本函数只用 `key`，`now` 仅为签名一致）                                                |
| MATH-35 | `answerRound` 后检查入参 `save`                                    | 未被改动（返回的是新对象）                                                                    |
| MATH-36 | 答对 10 道题后 `achievementState`                                  | `math-10` 进度为 `10` 并解锁（判据数「答对过的题数」，`reward.js` 只改一行判据）              |

`MATH-11` / `MATH-23` 是一对：答错照样算答过、照样打卡。线上要求答对才计入打卡条件，
而 `count` 题恒答对让「重答」变成纯点击 —— 少了这两条，下一个人「按线上抄回去」
会把刷分路径一起抄回来。

`MATH-05` / `MATH-06` 是偏离线上最要紧的一对：线上按天序号取，答对过与出题无关。

`MATH-07` / `MATH-08` 一起钉住「确定性打乱」：只有 `MATH-07` 会被
「干脆不打乱」蒙过，只有 `MATH-08` 会被 `Math.random()` 蒙过。

`MATH-16` / `MATH-17` 钉住「Boss 也算在 5 道里」：漏掉 Boss 会让升阶只要 4 道，
而 Boss 是当天必出的第三道题 —— 那条捷径每天都摆在眼前。

`MATH-32` 的「以 `stage` 为准」是两处可以矛盾的数据的仲裁规则，只有一条。

`MATH-36` 声明在本表而不是 `ACHV` 区：改的是 `reward.js` 的一行判据，
而「数答对过的题数」这条语义属于数学域（与 `ACHV-06` 那段古诗断言同一条分工）。

### 本轮追加到存储层的规格

`learningProgress.math` 的默认值与收敛（`SAVE-18`）、线上四字段的导入映射
（`IMPORT-15`）声明在 `docs/features/storage/doc.md`，本表不重复 ——
与 `SAVE-13` / `SAVE-17` 同一条分工：**存档形状归 `SAVE` / `IMPORT` 区，
数学域只声明 `MATH-NN`。**

## 范围外

- **不做复习调度。** 没有 `step` / `due`、没有间隔表、`save.js` 不加第三个上界常量。
  线上数学没有复习，而 30 道题一共只有 30 道，「明天再见」由「优先出没答对过的」
  自然完成（见上文）。`poem/summary.md` 预告的「第三份档位表」结论是**不要**。
- **不做题目生成器。** 30 道题是常量，不按阶段现算算式。线上也是固定题目，
  而现算要先拍板「难度怎么定、答案怎么造干扰项」—— 那是一份新的产品设计，不是迁移。
- **不做新题目。** 每阶段只有 5 道题、4 天左右走完一个阶段，这是**已知的内容限制**，
  写在这里是为了让下一个人知道它不是 bug。补题要先有内容源（与「不重新收集内容资产」
  同一条，见 `docs/vision.md`）。
- **不做降阶。** 阶段是终态，答错不退。与识字的掌握、古诗的会背一致。
- **不做 `count` 题的点数交互。** 线上「点满 target 个自动判对」的交互不搬 ——
  它恒答对（缺陷 3）。`items` / `target` 降级成插图参数。
- **不做 `sort` 题的拖拽排序。** 线上是三个选项按钮，本仓库照抄，不做拖拽。
- **不做 Boss 的额外奖励。** 线上 Boss 答对只多一句 toast、不多发货币，照抄 ——
  多发要重新拍板发放规则（`docs/features/point/doc.md`）。
- **不做当天答第 4 道题。** 每天恒 3 道，答完就是空态。线上可以无限答（缺陷 5、6），
  本仓库靠「当天去重 + 恒 3 道」两条一起封住。
- **不做 `math` 进核心名单。** `data/defaultHabits.js` 里 `core` 仍是 `false`，
  今日全勤仍是七条（与古诗那一轮同一条理由）。
- **不做取消数学打卡。** 与 `LEARN` 区一致：学习打卡不给撤回入口。
- **不做每天题数与升阶条件可配。** 每天 3 道、每阶段 5 道都是常量，不进 `parent` 设置。
  真要可配是 P7 的事。
- **不做首页显示数学进度。** `dayProgress` 的分母仍只数 `category === 'habit'`。
- **不做音效。** 线上答对答错各有一个音效（`playSfx('success' / 'wrong')`），
  全仓至今零音频资源，加它要先拍板包体积与静音开关的关系。
