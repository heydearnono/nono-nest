# 数学（30 道题 + 六阶段 + Boss 通关）· 完成总结

- 完成日期：2026-08-14
- 实际改动：`miniprogram/data/mathRounds.js`（新增，30 条 + 6 条阶段）、
  `miniprogram/utils/math.js`（新增）、`miniprogram/pages/math/`（四个文件）、
  `miniprogram/utils/reward.js`（**改一行判据**，`math_games` 的字段名）、
  `miniprogram/utils/save.js`（`learningProgress.math` 默认值与收敛、`MATH_STAGE_MAX`）、
  `miniprogram/utils/importOnline.js`（只接 `currentStage`）、
  `miniprogram/data/learningModules.js`（数学那格的 `page` 填上）、`miniprogram/app.json`
  （一个 page，不加第五个 tab）、`tests/math.test.js`（新增）、`tests/save.test.js`、
  `tests/importOnline.test.js`、`tests/reward.test.js`（`ACHV-06`）、
  `tests/learning.test.js`（`LEARN-02`）、`docs/glossary.md`、
  `docs/features/storage/doc.md`、`docs/features/learning/doc.md`、
  `docs/features/reward/doc.md`
- 规格：`MATH-01` ~ `36`，加存储层的 `SAVE-18` / `IMPORT-15`（38 条）
- 门禁：`npm run check` 全绿（11 份 doc.md，303 条规格，13 个测试文件 / 317 个测试）
- **P5 的第五格亮了 —— 入口页再没有灰格子，`LEARN-02` 这条断言改到第四次为止**

## 实现要点

**出题优先没答对过的题，不是天序号取模。** 线上 `(天序号 % 4)` 与「答对过什么」
毫无关系：第五天回到第一道，已经会的题一直重复、不会的题永远轮不上。本仓库
`pickToday` 把本阶段四道普通题分成「没答对过」与「已答对过」两段拼起来取两道，
Boss 追加在末尾。`MATH-05`（答对过的题让位）与 `MATH-06`（都答对过时用已答对的补）
是本轮偏离线上最要紧的一对。

**不跨阶段借题 —— 线上那条 fallback 是死代码。** 每个阶段都有 4 道普通题，
`normal.length === 0` 不可能成立。本仓库的补题只在本阶段内按数据包顺序转一圈，
`MATH-06` 断言三张卡的 `stage` 全是当前阶段。

**升阶要 5 道含 Boss。** `clearedIn` 数的是本阶段 `correct` 为真的题，Boss 算在里面。
漏掉它升阶只要 4 道普通题，而 Boss 是当天必出的第三道 —— 那条捷径每天摆在眼前
（`MATH-17` 钉的就是这条）。同一个函数还喂页头的「本阶段 N/5」：共用判据共用函数。

**没有 `step` / `due`，也没有第三份间隔表。** `poem/summary.md` 预告过「数学若要复习
调度是第三份」，本轮的结论是**不要**：30 道题一共只有 30 道，「明天再见」由出题顺序
自然完成。`save.js` 因此仍只有两个档位上界常量，新加的 `MATH_STAGE_MAX = 6` 是
**阶段数**，头注释与 `docs/glossary.md` 各记一次，免得下一个人当成第三个上界。

**选项按 `dayKey` 确定性打乱，这是本轮唯一真正新的机制。** 30 道里 20 道 `answer: 1`、
阶段 4 与 5 的十道全是 —— 线上「永远点第二个」是必胜策略。种子只吃 `key` 与题 id
（不吃存档：答过一次后顺序跳位，孩子会以为换了题），种子化 Fisher-Yates 同时搬动
`answerIndex`。`MATH-07`（同一天恒定）与 `MATH-08`（跨天变化、正确文案不变）必须
成对存在：少了前一条，「干脆不打乱」能过；少了后一条，`Math.random()` 能过。

**`correct` 是终态，`wrong` 累加。** 答对过之后再答错也不退回（`MATH-13`），
对照识字 `step` 答错回 `0`。五岁孩子那 30 道题的目的是「都做对过一次」，
不是保持熟练度。

**答对答错都算答过、都打卡。** 打卡条件是当天 `rounds.length >= 3`，
`MATH-23` 断言三道全答错照样 2⭐2🍖8 经验。线上要答对才计入，还配一个刷不完的
`gamesCompleted`。

**当天重复答同一道题原样返回**（`MATH-15`）。这一条同时封住线上「连点十次同一道题
解锁 `math-10`」那条刷分路径 —— 不是加守卫，是「恒 3 道 + 当天去重」让第 4 道不存在。

**发放先行、记录后写**（P6 起的做法）：`day` 从 `awarded` 里取，`checks` / `ledger` /
`learning` 三个兄弟键不可能互相覆盖（`MATH-24`）。

**`answerRound` 只返回存档。** 「刚升阶了没有」既不是存档字段也不是第二个返回值，
页面比较前后 `stage`（`MATH-19`）。升阶 toast 与打卡 toast 因此在页面层排队。

## 与 `doc.md` 的偏差

**没有设计上的偏差。** 四处偏离线上（优先出没答对过的、当天三道都答过即打卡、
5 道含 Boss 都答对过才升阶、选项按天打乱）与 36 条规格全部照 `doc.md` 落地。

**四处数目订正。** 实现时按真实数据核了一遍，`doc.md` 的统计有四处对不上：
`kind` 的 `count` 4→**2** / `choice` 16→**18**、`answer: 1` 的 19→**20**、
缺陷 3 的「四道 `count` 题」→「两道」、缺陷 4 的「19 道」→「20 道」。
改的是文档，转抄的数据一个字没动。

**一处自相矛盾修掉。** `mathState` 的形状块里列了 `advanced: false`，
而十二行之下的散文写着「它不该是返回值」。删掉形状块那一行，并把那段改写成
「**「刚升阶了没有」不在上面这张表里**」。

## 数据包：零修正，因为数据本来就是对的

30 条一字未改，**没有 `p68` 那样的修正**。`m2-2`（「3、1、2 从小到大」）看起来是
线上的一处错误，实际是**判定错了不是数据错了**：线上 `sort` 题走一条字符串比较的旁路，
本仓库判定统一走 `answer` 下标，那个矛盾自然消失。`count` 题恒答对（缺陷 3）
与 `m2-2` 是同一个病根，一起没了。

**`isBoss` 在 30 条上全部补齐**（普通题 `false`）——线上只有 6 道 Boss 有这个键。
这是**补齐不是改值**：`item.isBoss` 在缺键时是 `undefined`，`typeof` 断言
（`MATH-02`）会炸，而 `filter(item => item.isBoss)` 两种写法结果相同。

**阶段内的顺序照搬，Boss 不挪到末尾。** 阶段 1 的 Boss 排在数组第三位，
数据包保留原序，「Boss 永远是当天第三道」由 `pickToday` 负责（`MATH-04`）——
顺序是数据的事实，出题是逻辑的选择，两件事不混。

`count` 的 `items` / `target` **降级成插图参数**：线上「点满 target 个自动判对」
的交互不搬（它恒答对），这两个字段现在只回答「上面画几个苹果」。

## 顺带修的那一行判据

`reward.js` 的 `math_games` 读的是 `learningProgress.math?.games` —— 这个字段
**线上叫 `gamesCompleted`、本仓库叫 `rounds`，两边都没有 `games`**。门禁抓不到它：
「进度恒 `0`」既是「子键还不存在」的正常表现、也是「字段名对不上」的表现，
观测结果一模一样，而 `ACHV-06` 当时只断言了前者。

改成数 `rounds` 里 `correct` 为真的题数（不是答题次数 —— 线上那个每答一题就 +1、
无去重，连点十次同一道题就解锁）。`reward.js` 不能 import `math.js`（会成环），
所以判据直接读存档：`rounds` 是一层对象、`correct` 是布尔，不需要知道六个阶段
各有哪五道题，也就不 import `data/mathRounds.js`。

**教训写进了 `docs/features/reward/doc.md`：空进度的断言必须配一条非空进度的断言，
否则钉住的只是「没炸」。** `MATH-36` 造十道答对的题断言解锁，`ACHV-06` 补了
一段数学的非空断言（并加一条「答错的题不算」）。`poem-10` 逃过这一劫是运气 ——
它读的 `poems` 恰好与古诗那一轮落的字段同名。

## 页面的四处约定

**一次一道题，页面不存下标。** 队首取 `state.rounds` 里第一条 `answered` 为假的，
答完 1.5 秒重算一次状态，下一道自然顶上来（与识字页同一条）。反馈期间 `locked`
锁住选项，免得连点把下一道也答了。

**插图参数在页面层拼。** `repeat` 在 WXML 里写不了，而 `mathState` 是纯函数、
不该知道「画几个苹果」。`figureOf` 把 `count` / `compare` / `sort` 三种题型的
插图拼成能直接绑的字符串，`choice` 与 `match` 只有题干与选项。

**两句 toast 排队，不互相覆盖。** 升阶与打卡可能在同一次答题里一起发生
（本阶段第 5 道恰好是当天第 3 道），两句 `showToast` 挨着调后一句会吃掉前一句 ——
线上就是这么丢掉升阶提示的（缺陷 10）。页面隔 1.4 秒依次弹，定时器在 `onUnload` 清掉。

**三个圆点读的是历史上的 `correct`。** 「以前答对过、今天又答错」的那一道
（只有 Boss 天天回来）会显示成绿点。三个点是进度不是成绩单，为这一种情况在
`mathState` 里多存一个「今天答对没有」不值得 —— 这是刻意的取舍，记在页面注释里。

## 对后续 feature 的影响

- **P5 完整了。** 入口页五格全亮，`learningModules.js` 的 `page` 再没有空串，
  `LEARN-02` 从此断言「五格 `ready` 全为 `true`」—— 它改了四次，这是最后一次，
  往后它钉的是「别把某一格的 `page` 删空」。
- **`learningProgress` 这个顶层键满了。** `literacy` / `guoxue` / `math` 三个子键
  到齐，`reading` 与 `english` 不进这个键（它们没有跨天进度）。分工第三次验证成立。
- **成就墙第一次全部在数真实进度。** 十一条判据里再没有恒 `0` 的。
- **P7 家长端的缺口仍是最大的一个。** `importOnline.js` 现在能接线上的识字、古诗、
  数学进度（`IMPORT-11` / `14` / `15`），但全仓依旧**零 importer** —— nono 线上的
  进度要等 P7 才真能搬。
- **P7 若要「补题」，要先有内容源。** 每阶段 5 道、4 天左右走完一个阶段是**已知的
  内容限制**，不是 bug（`doc.md` 范围外写明）。补题不是改常量的活。
- **P8 的音效仍然没有着落。** 线上答对答错各有一个音效，全仓至今零音频资源。
- **不做的仍然不做。** 题目生成器、新题目、降阶、`count` 的点数交互、`sort` 的拖拽、
  Boss 额外奖励、当天第 4 道题、`math` 进核心名单、取消数学打卡、每天题数与升阶条件
  可配、首页显示数学进度、音效。
