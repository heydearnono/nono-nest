# 学习入口页 · 阅读打卡 · 英语打卡

- 区名：`LEARN`（学习入口页与五个子模块共用的打卡路径）、`READ`（阅读）、`ENG`（英语）
- 模块：`miniprogram/utils/learning.js`、`miniprogram/data/learningModules.js`、
  `miniprogram/pages/learning/`、`miniprogram/pages/reading/`、`miniprogram/pages/english/`
- 状态：本轮（阅读 + 英语）已完成，识字 / 国学 / 数学未开始
- 关联愿景：`docs/vision.md` P5（本轮只做五个子模块里的两个）

## 背景

`docs/vision.md` 的 P5 是五个学习子页。本轮**只做阅读与英语**，理由是这两个在线上
几乎没有学习逻辑：填一张表、点一下完成，就是一次打卡。识字与古诗要先把 2000 字 /
169 首的数据包搬进 `data/`，还要移植固定间隔的复习调度；数学要 30 道题与六阶段升阶规则。
先把「学习域怎么接进已有的打卡 → 发放 → 成长这条链」验证一遍，再做带内容的三个。

顺带的收益：`reading` 是线上今日全勤那 8 条核心 id 之一
（见 `docs/features/point/summary.md`），它有了打卡入口，P3-b 的勋章产出就少一个缺口。

`learning` 与 `health` 两类任务的定义在 P2 就已落库（`docs/features/habit/doc.md`
「范围外」明确写了「定义落库，渲染留给 P5 / P6」），所以本轮不动 `data/defaultHabits.js`。

线上的对应实现（从 bundle 逆向，已核对）：

| 项       | 线上做法                                                                             |
| -------- | ------------------------------------------------------------------------------------ |
| 入口     | `/learning` 列出五项，每项显示 `desc` 与一行累计文案，已完成的那条变绿并加「已完成」 |
| 阅读提交 | `updateReading(patch)`：合并进 `dailyRecords[日].learning.reading`                   |
| 英语提交 | `updateEnglish(patch)`：同结构，写 `learning.english`                                |
| 发放     | `patch.completed` 且该 `module` 的任务今天未完成时，按 `pointRules.learning` 发放    |
| 经验     | 学习打卡 `{ exp: 8 }`，**自律打卡是 `{ exp: 5 }`**（五个学习模块都是 8）             |
| 重复提交 | 阅读弹「今天已经打过阅读卡啦 📖」，但**记录仍被合并改写**；英语连提示都没有          |
| 阅读字段 | `minutes`(默认 15) `bookTitle`(必填) `pages` `mode` `favorite` `mood` `coverDataUrl` |
| 英语字段 | `minutes` `words`(逗号分隔) `sentences`(`                                            | `分隔)`readAloudCount`(0–10) `parentNote` |
| 累计     | 英语头部显示 `learningProgress.english.streak`，阅读入口显示 `reading.totalMinutes`  |

**那两个累计数在线上永远是 0。** `english.streak`、`reading.totalMinutes`、
`reading.books` 全仓只有读取与默认值，没有任何写入路径（已逐处核对）——
`docs/features/storage/doc.md` 早就把它们标成死字段。本仓库因此**不做累计文案**，
入口页只显示「今天做了没有」。

## 设计

### 一条链，两张表

阅读与英语的差别只在**表单字段**，打卡之后的事完全相同：写当天记录 → 打卡 →
发货币与流水 → 涨经验与开心度。所以只有一条打卡函数 `completeLearning`，
按 `module` 取一张「怎么把表单收敛成记录」的规范化表；`READ` / `ENG` 两个区
钉的都是自己那张表，`LEARN` 区钉的是它们共用的那条链。

反过来写（两个 `completeRead` / `completeEnglish`）的代价是发放与幂等的逻辑抄两遍，
第三个模块（数学）落地时抄第三遍 —— 而那三处正是最不能不一致的地方。

### 当天记录长出 `learning` 兄弟键

```js
days['2026-08-12'] = {
  checks: { reading: { at: 1754880000000 } },  // HABIT 区
  ledger: [ ... ],                              // POINT 区
  learning: {                                   // 本区新增
    reading: { minutes: 20, bookTitle: '小熊的一天', pages: 12,
               mode: 'together', favorite: '小熊摔倒那页', mood: '😍' },
    english: { minutes: 15, words: ['apple', 'bear'], sentences: ['I see a bear.'],
               readAloudCount: 3, parentNote: '' },
  },
}
```

这是 `docs/features/habit/doc.md` 预留的形状（「`days[dayKey]` 后面还会长出 `ledger`、
`health` 等兄弟键，本层只写 `checks`」）。**存档层一行不改**：`normalizeSave` 对 `days`
是整体透传，`SAVE-11` 已经钉住「日期键下的内容原样保留」。本区不新增 `SAVE` / `IMPORT` 规格。

记录里**不存 `at`**：打卡时刻已经在 `checks[habitId].at` 里，存两份会出现两个「什么时候完成的」。

### 与线上的偏差：打过卡之后不能再改记录

线上重复提交会把记录合并改写（阅读还会弹一句提示，英语静默）。本仓库**第二次提交原样返回**，
记录停在第一次的内容 —— 与 `check` / `checkAndAward` / `feed` 完全同构：
「什么都不该发生时返回入参本身」是贯穿 `HABIT` / `POINT` / `PET` 三个区的不变式，
页面靠 `next === this.save` 判断要不要落盘。

为了「读完又多读了 5 分钟，回来改一下时长」而破坏它，需要在同一性之外再做一次深比较
（否则每次进页面都会白写一次存档）。代价与收益不成比例，所以选幂等。
真要能改，那是家长端（P7）的每日报告顺带做的事，不是孩子的打卡按钮。

### 与线上的偏差：不存书籍封面

线上 `coverDataUrl` 是一张 base64 图片，随记录进 IndexedDB。本仓库**不做**：

- 小程序单个 storage 键上限 1MB、整体 10MB，一张手机拍的封面 base64 后几百 KB，
  存几天就把整份存档撑爆 —— 而存档是**一个键存全部**（`nono-save`）。
- 仓库要求「零二进制资源」（`docs/features/pet/doc.md` 里 tabBar 不用图片图标是同一条）。

代价是阅读记录没有图。书名是文字，5 岁孩子认不全，但她认得住自己刚读完的那本 ——
这一格的驱动力来自「今天读了」，不是来自封面。

### 入口页顺序按 `sortOrder`，不按线上

线上入口页的顺序（国学 / 识字 / 数学 / 英语 / 阅读）与它自己 `tasks` 里的顺序
（识字 / 阅读 / 国学 / 数学 / 英语）不一致。本仓库统一按 `data/defaultHabits.js` 的
`sortOrder`（10–14），也就是识字 / 阅读 / 国学 / 数学 / 英语 ——
入口页的顺序与家长端将来的排序是同一个依据，不出现两套顺序。

### `data/learningModules.js`：五条，三条还没有页面

```js
{ module: 'reading', name: '阅读', icon: '📖', desc: '亲子/独立阅读', page: 'pages/reading/reading' }
```

`module` 与 `desc` 抄线上入口页；`name` 与 `data/defaultHabits.js` 里那五条学习任务一致。
`icon` 抄的是**线上入口页**而不是它自己的任务表：任务表里英语与识字都是 `🔤`，
五格列在一起会看到两个一样的图标，而入口页给英语用的是 `🅰️`。
5 岁的孩子靠图标认格子，重复的图标等于两格没有区别 —— 所以这里取入口页那份。
（首页不渲染学习任务，`data/defaultHabits.js` 里的 `🔤` 目前没有显示点，本轮不改它：
那是一份转抄的既有资产，改它要连带改 P7 家长端将来的编辑面。）

`page` 是空字符串时表示「这一格还没做」—— 入口页把它渲染成灰的，点了给一句「还在做」。
识字 / 国学 / 数学三条现在都是空串，做完各自的 feature 时填上。

用一个 `page` 字段同时表达「跳哪里」与「做没做」，而不是再加一个 `ready` 布尔值：
两个字段会出现「`ready: true` 但 `page` 是空串」的第三种状态，而它没有意义。
`listLearning` 会把它翻成 `ready`，页面不判断空字符串（`AGENTS.md` 第 3 节）。

### 任务按 `module` 找，不假设 `id === module`

线上发放前是 `tasks.find(t => t.module === 模块名)`。本仓库沿用：虽然那五条任务的
`id` 与 `module` 取值恰好相同，但那是 `data/defaultHabits.js` 的巧合，
不是约定 —— 家长端（P7）可以增删任务，`module` 才是「这一格对应哪个学习子页」的字段。

找不到时抛 `RangeError`（`LEARN-11`）：与 `findHabit` 同一条策略。
默认表里有这五条，找不到只可能是存档被改坏或代码写错。

**但 `listLearning` 例外，它不抛错**：家长（P7）删掉某条学习任务后，入口页仍要能打开，
那一格显示成「今天还没做」。抛错等于白屏 —— 与 `petState` 对坏 `type` 宽容、
`choosePet` 严格是同一条取舍（`AGENTS.md` 第 5 节第 6 条：存档宽容、渲染宽容、编程错误严格）。
严格的是提交路径（`completeLearning`）。

### `utils/learning.js` 的四个纯函数

```js
listLearning(save, dayKey)                      -> { items, done, total }  // 入口页唯一读取入口
learningLog(save, dayKey, module)               -> form   // 表单初值（回填 + 默认值）
learningBlock(save, dayKey, module, form)       -> 'done' | 'noTitle' | null
completeLearning(save, dayKey, module, form, now) -> save // 写记录 + 打卡 + 发放 + 成长
```

依赖方向 `learning.js → pet.js → point.js → habit.js → data/`，无环。

`learningBlock` 返回**原因码**而不是布尔值，与 `petState().feedBlock` 同一套约定：
页面要按原因选不同的提示语（「今天已经打过卡啦」/「请先填写书名」），
返回布尔值会让页面自己再判断一次「为什么不能」，校验规则就回到页面里了。

`learningLog` 返回的是**表单形状**而不是存档形状：`words` / `sentences` 在存档里是数组，
在输入框里是字符串。转换发生在这一处的来回两个方向上，页面不做 `join` / `split`。

`completeLearning` 的形状与 `feed` 一致：**不能打卡时原样返回**，不抛错 ——
书名没填、今天已经打过，都是正常的用户状态，不是编程错误（`AGENTS.md` 第 5 节第 6 条）。
抛错的只有两类：未登记的 `module`（`RangeError`）与非有限数的 `now`（`TypeError`）。

另外导出两个常量给页面渲染用：`READ_OPTIONS`（`{ modes: [{ value, label }], moods: [...] }`）
与 `ENG_OPTIONS`（`{ readAloudMin, readAloudMax }`）。理由与 `petState().types` 同一条：
页面不跨过 `utils` 直接摸 `data/`，也不把白名单与边界抄第二遍 —— 抄第二遍就会出现
「按钮上有第三种方式，但 `toRecord` 把它收敛掉了」「加减器按得出 11 而存档里落 10」
这种对不上的情况。`READ_MODES` / `READ_MOODS` / `READ_ALOUD_MAX` 都由它们派生，
所以按钮与收敛用的是同一份数据（`READ-05` / `READ-06` / `ENG-04` 落的值就来自这里）。
收敛的权威仍在 `toRecord`：页面夹一次只是让按钮到边界不再动，不是第二处规则。

### 经验从 5 变成 8：给 `checkAwardAndGrow` 加参数

学习打卡在线上给 8 点经验，自律打卡给 5。`docs/features/pet/summary.md` 已经先一步定下了
做法：「改 `checkAwardAndGrow` 的入参，不要在 `pet.js` 里按 `habitId` 分支」，
因为 `pet.js` 认识 `habitId` 会让它反向依赖 `data/defaultHabits.js`。

所以 `checkAwardAndGrow` 多一个可选的第五参数，默认值就是自律打卡的 5：

```js
checkAwardAndGrow(save, dayKey, habitId, now, gainedExp = EXP_PER_CHECK) -> save
```

首页（`pages/home/home.js`）一行不改；`completeLearning` 显式传 `EXP_PER_LEARNING`（8）。
「这次打卡值多少经验」由调用方决定，常量放在各自的模块里。
`PET` 区的规格表不受影响（默认值就是原行为），本轮的 8 由 `LEARN-08` 钉住。

### 三个页面

| 页面              | 内容                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `pages/learning/` | 五格列表：icon + 名字 + `desc` + 「已完成」角标；顶部一行「今天 N/5」 |
| `pages/reading/`  | 书名、分钟、页数、亲子/独立、最喜欢的内容、五个心情 emoji、一个大按钮 |
| `pages/english/`  | 分钟、单词、句子、跟读次数、家长备注、一个大按钮                      |

`app.json` 的 tabBar 加第三个 tab（`📚 学习`），插在首页与小伙伴之间：
学习是每天要进去几次的地方，放在中间比放在末尾少一次误触。仍**不用图片图标**。

阅读与英语两个页面走 `wx.navigateTo`（不是 tab），返回时入口页 `onShow` 重读存档，
所以那一格的「已完成」不需要页面间通信。

两个表单页取初值用 `onLoad` 而**不是** `onShow`：它们不是 tab 页，`navigateTo` 进来只
`onLoad` 一次；放在 `onShow` 会在从别处（将来的书籍选择、拍照）返回时，把家长填了一半的
表单重置回存档内容。入口页反过来必须用 `onShow`（tab 页不重新 `onLoad`）。

## 行为规格

### 学习入口与共用的打卡链（`LEARN`）

| Spec ID  | 输入                                          | 期望输出                                                                           |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| LEARN-01 | `listLearning(save, dayKey)`                  | 5 条，顺序 识字 / 阅读 / 国学 / 数学 / 英语（`sortOrder` 10–14）                   |
| LEARN-02 | 同上                                          | 阅读与英语 `ready` 为 `true`，识字 / 国学 / 数学为 `false`                         |
| LEARN-03 | 阅读打过卡后 `listLearning`                   | 阅读那条 `done` 为 `true`，汇总为 `{ done: 1, total: 5 }`                          |
| LEARN-04 | `completeLearning` 传未登记的 `module`        | 抛 `RangeError`                                                                    |
| LEARN-05 | `completeLearning` 的 `now` 非有限数          | 抛 `TypeError`                                                                     |
| LEARN-06 | 同一 `module` 连续两次 `completeLearning`     | 第二次原样返回（同一性），货币 / 流水 / 经验 / 记录都不再变                        |
| LEARN-07 | 完成阅读打卡                                  | `star` +2、`petFood` +2，流水一条 `earn`，`reason` 为 `学习：阅读`                 |
| LEARN-08 | 同上                                          | `petExp` +8（不是自律打卡的 5），`mood` +1                                         |
| LEARN-09 | `completeLearning` 后检查入参 `save`          | 未被改动（返回的是新对象）                                                         |
| LEARN-10 | 完成阅读打卡后看 `days[dayKey]`               | `checks` / `ledger` / `learning` 三个兄弟键同时存在，互不覆盖                      |
| LEARN-11 | `habits` 里没有 `module === 'reading'` 的任务 | `completeLearning` 抛 `RangeError`，但 `listLearning` 不抛，那格 `done` 为 `false` |

`LEARN-08` 是本轮唯一改到 `PET` 区实现的地方（`checkAwardAndGrow` 的第五参数）。
它钉在这里而不是 `PET` 区：那个参数的默认值仍是 5，`PET-15` 断言的行为一个字没变。

### 阅读打卡（`READ`）

| Spec ID | 输入                                                     | 期望输出                                                            |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| READ-01 | 填好表单后 `completeLearning(save, key, 'reading', ...)` | `days[key].learning.reading` 六个字段与表单一致                     |
| READ-02 | 书名为空串 / 全是空格                                    | `learningBlock` 为 `'noTitle'`，`completeLearning` 原样返回         |
| READ-03 | 今天已经打过阅读卡                                       | `learningBlock` 为 `'done'`，记录停在第一次的内容                   |
| READ-04 | `minutes` 为 `''` / `-3` / `20.4`                        | 收敛成 `0` / `0` / `20`（非负整数），`pages` 同规则                 |
| READ-05 | `mode` 不是 `together` / `solo`                          | 落 `'together'`                                                     |
| READ-06 | `mood` 不在五个 emoji 里                                 | 落 `'😊'`                                                           |
| READ-07 | 今天还没填过时 `learningLog(save, key, 'reading')`       | `minutes` 为 `15`、`mode` 为 `'together'`、`mood` 为 `'😊'`，其余空 |
| READ-08 | 已打过卡时 `learningLog`                                 | 回显存档里的六个字段                                                |

`minutes` 默认 15 抄线上（`useState(t?.minutes ?? 15)`），是「一次阅读大概多久」的经验值。
书名必填也抄线上（`请先填写书名哦 📚`）—— 它是这条记录唯一能让家长回头认出「读的是哪本」的字段。

### 英语打卡（`ENG`）

| Spec ID | 输入                                                     | 期望输出                                                        |
| ------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| ENG-01  | 填好表单后 `completeLearning(save, key, 'english', ...)` | `days[key].learning.english` 五个字段与表单一致                 |
| ENG-02  | `words` 为 `'apple, bear，cat ,'`                        | 数组 `['apple', 'bear', 'cat']`（中英文逗号都切，去空白与空项） |
| ENG-03  | `sentences` 为 `'I see a bear. \| Good night.'`          | 数组 `['I see a bear.', 'Good night.']`                         |
| ENG-04  | `readAloudCount` 为 `-1` / `99`                          | 收敛成 `0` / `10`                                               |
| ENG-05  | 今天已经打过英语卡                                       | `learningBlock` 为 `'done'`，第二次提交原样返回                 |
| ENG-06  | 表单全为空时 `learningBlock(save, key, 'english', form)` | `null` —— 英语没有必填字段，空表单也能打卡                      |
| ENG-07  | 已打过卡时 `learningLog(save, key, 'english')`           | `words` 用 `', '` 连回字符串，`sentences` 用 `' \| '`           |

`ENG-06` 与 `READ-02` 刻意不一致：阅读的书名必填、英语什么都不填也能打卡。
线上就是这样，而且它有道理 —— 英语是跟着课程 App 上完课回来「记一笔」，
课程内容不由这张表定义；阅读的「读了哪本」除了这张表没有别处记。
两条规格都在，是为了挡住下一个人把它们改成一致的。

`readAloudCount` 的上限 10 抄线上的 `range` 输入框（`min=0 max=10`），
不是随手取的数：它是「跟读几遍」，不是「读了多少个词」。

## 范围外

- **不做识字 / 国学 / 数学三个子页。** 入口页给它们留了灰格子（`page` 为空串）。
  识字与古诗要先把 2000 字 / 169 首搬进 `data/` 并移植复习调度，数学要 30 道题与六阶段
  升阶规则，各自一轮。
- **不做 `learningProgress` 顶层键。** 线上那五个子对象里，与阅读 / 英语相关的三个字段
  （`english.streak`、`reading.totalMinutes`、`reading.books`）**在线上就是死字段**，
  搬过来只会在本仓库也变成死字段。识字 / 国学 / 数学的复习调度确实需要跨天的累计状态，
  届时由它们各自的 feature 定义存档结构并扩 `IMPORT` 映射表
  （`docs/features/storage/doc.md` 已经把这条留成了空位）。
- **不做累计文案。** 入口页每格只显示「今天做了没有」，不显示「累计 N 分钟」/「连续 N 天」
  —— 数据源不存在（见上一条）。
- **不做书籍封面。** 见上文的取舍。
- **不做打卡后修改记录。** 见上文的取舍。第二次提交原样返回。
- **不做取消学习打卡。** 首页的自律格子能取消（`uncheckAndRefund`），学习打卡不给撤回入口：
  取消要连带删掉 `learning` 记录，而「记录删了但流水退了」与「流水退了但记录还在」
  哪个对，得先有家长端的每日报告才说得清。真要撤回，走 P7。
- **不做首页显示学习进度。** 首页仍是 P2 定下的「问候语 + 进度 + 货币带 + 九个自律格子」，
  `dayProgress` 的分母仍只数 `category === 'habit'`。学习完成度在学习 tab 里。
- **不做语音跟读。** `readAloudCount` 是**手填的次数**，不接语音识别 ——
  `docs/vision.md`「与线上的已知差异」已写明第一期降级为手动确认（P8 才评估 WechatSI）。
- **不做家长确认。** 五条学习任务的 `needsParentConfirm` 都是 `false`，字段仍只读不写（P7）。
- **不做今日全勤与勋章。** `reading` 打上了只是让 P3-b 少一个缺口，全勤判定本身在 `POINT` 区。
