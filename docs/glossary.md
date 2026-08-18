# 领域术语字典

> AI 在生成代码、文档、注释、测试名时**必须**使用本表中的词，不得自创同义词。
> 新增术语必须同步更新本文件（见 `AGENTS.md` 第 2 节）。
> 「禁用词」列出的是容易被自动生成的错误同义词，出现即视为不合规。

本表的标识符是**本仓库的规范命名**。线上工作台（见 `docs/vision.md`「前身」）的存档字段名
与本表可能不同，两者的映射关系在 `docs/features/storage/doc.md` 里给出，
**不要**直接把线上字段名当作本仓库标识符使用。

## 实体

| 中文       | 标识符              | 含义                                                                     | 禁用词                                           |
| ---------- | ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| 存档       | `save`              | 落到 storage 的持久化数据，全局单例                                      | `profile` / `record` / `db` / `state`            |
| 孩子昵称   | `childName`         | 家长设置的显示名，默认 `nono`                                            | `userName` / `nickname` / `kidName`              |
| 打卡项     | `checkItem`         | 首页可打卡的一项（识字、刷牙……）                                         | `task`（`task` 专指家长端可编辑的自律任务）      |
| 自律任务   | `habit`             | 家长端可增删的习惯项，是 `checkItem` 的来源                              | `routine` / `todo` / `chore`                     |
| 奖励       | `reward`            | 可用勋章兑换的项（零食、动画片、零花钱）                                 | `prize` / `gift` / `item`                        |
| 兑换记录   | `redemption`        | 一次兑换请求及其状态                                                     | `order` / `exchange` / `log`                     |
| 兑换状态   | `status`            | `pending` 等家长兑现 / `done` 已兑现                                     | `state` / `stage` / `phase`                      |
| 贴纸       | `sticker`           | 抽取获得的收藏物，有类别与稀有度，共 140 张                              | `card` / `badge` / `collectible`                 |
| 贴纸类别   | `category`          | 六类，按图鉴段序：`animal` `food` `nature` `cute` `star` `fantasy`       | `type` / `group` / `kind` / `tag`                |
| 稀有度     | `rarity`            | 三档：`common` / `uncommon` / `rare`                                     | `level` / `grade` / `tier` / `quality`           |
| 收藏册     | `stickerCollection` | 存档顶层键，`stickerId` → 抽到过几次，**键存在即拥有**                   | `stickers` / `album` / `owned` / `inventory`     |
| 免费抽     | `free`              | `source` 的取值之一（每天一次、不花勋章），另一个是 `medal`              | `daily` / `gift` / `bonus` / `freeDraw`          |
| 成就       | `achievement`       | 达成条件后解锁，一次性                                                   | `medal`（`medal` 是货币）/ `trophy` / `badge`    |
| 宠物       | `pet`               | 陪伴主角，全局唯一，形象可更换                                           | `animal` / `creature` / `nono`（nono 是孩子）    |
| 宠物状态   | `petState`          | 某一时刻宠物的完整可观测状态                                             | `status` / `petInfo` / `petData`                 |
| 汉字       | `character`         | 汉字库中的一条（含拼音、组词、例句）                                     | `word` / `hanzi` / `char`（`char` 是它的字段名） |
| 古诗       | `poem`              | 古诗库中的一首                                                           | `poetry` / `verse` / `shi`                       |
| 数学阶段   | `mathStage`         | 六个阶段之一（数感 → 钟表人民币），五道全答对过即升一阶，上限 6、不降阶  | `level` / `chapter` / `unit`                     |
| 关卡       | `mathRound`         | 30 道固定题之一（每阶段 4 普通 + 1 Boss），`correct` 是终态              | `question` / `quiz` / `game`                     |
| 打卡流水   | `ledgerEntry`       | 一次货币增减的记录，挂在当天的存档下                                     | `transaction` / `history` / `log`                |
| 学习子模块 | `module`            | 五个学习子页之一：`literacy` / `reading` / `guoxue` / `math` / `english` | `subject` / `subCategory` / `lesson`             |
| 学习记录   | `learningLog`       | 当天某个学习子模块填写的内容（书名、时长……）                             | `detail` / `entry` / `form`                      |
| 共读方式   | `mode`              | 阅读的两种方式：`together` 亲子共读 / `solo` 独立阅读                    | `type` / `kind` / `style`                        |
| 健康记录   | `healthLog`         | 当天的健康记录（饮食、便便、洗澡、运动共十一个字段）                     | `healthData` / `healthRecord` / `daily`          |
| 便便心情   | `poopIcon`          | 三个 emoji 之一：😊 😐 😣，选一个即记了一次便便                          | `poopMood` / `emoji` / `feeling`                 |

贴纸那四条（`category` / `rarity` / `stickerCollection` / `free`）是 `STICKER` 一轮登记的。
`category` 与 `rarity` 都是**数据字段名**，与古诗的 `grade` / `tier` 同一条处理：
中文标签（`动物` / `美食` / `自然` / `可爱` / `星星` / `奇幻`、`普通` / `稀有` / `超稀有`）
由 `utils/sticker.js` 映射给页面，
`data/stickers.js` 里只有英文取值。**`rarity` 的禁用词含 `tier`** —— 古诗已经用掉那个词
表示「必背 / 拓展」，两个域各自的分级不共用一个标识符。

**`stickerCollection` 是「键存在即拥有」**，值只用来数「抽到过几次」：所以 `0` 不是
「拥有 0 张」而是脏数据，`normalizeSave` 收敛时整条丢掉（`SAVE-25`）。它与
`rewardFlags` 是同一类顶层键（`id` → 值的表、未知 id 原样留着），但**不变式的方向相反**：
`rewardFlags` 缺键有含义（= 启用），`stickerCollection` 缺键就是没有。

`free` 与 `medal` 是 `drawSticker` 的 `source` 入参的两个取值，**不是两个动作** ——
抽贴纸只有一个动词 `draw`（见「动作」一节），两条路径的区别只在扣不扣勋章。

## 货币与数值

四种货币都**只能靠打卡产出**，不可购买（见 `docs/vision.md`「明确不做」）。

| 中文     | 标识符     | 取值                     | 含义                           | 禁用词                                    |
| -------- | ---------- | ------------------------ | ------------------------------ | ----------------------------------------- |
| 星光     | `star`     | 非负整数                 | 打卡的主产出                   | `point` / `score` / `coin` / `light`      |
| 宝石     | `gem`      | 非负整数                 | 稀有产出，只由周奖励产出       | `diamond` / `crystal` / `jewel`           |
| 宠物粮   | `petFood`  | 非负整数                 | 喂食消耗，**1 次喂食扣 2 点**  | `food` / `feed` / `meal`                  |
| 勋章     | `medal`    | 非负整数                 | 兑换奖励与抽贴纸的消耗         | `badge` / `token` / `ticket` / `honor`    |
| 饱腹度   | `fullness` | **0–5 整数**，越大越饱   | 5 = 刚吃饱，0 = 最饿（保底）   | `hunger` / `satiety` / `food` / `hungry`  |
| 开心度   | `mood`     | **0–5 整数**，越大越开心 | 5 = 最开心，0 = 最低落（保底） | `happiness` / `happy` / `joy` / `emotion` |
| 宠物等级 | `petLevel` | 正整数，从 1 开始        | 由累计经验提升，不下降         | `lv` / `rank` / `stage`                   |
| 宠物经验 | `petExp`   | 非负整数                 | 升级需求 = `petLevel × 100`    | `xp` / `point` / `growth`                 |

`fullness` 与 `mood` **方向一致：越大越好**，量纲都是 0–5 的离散档位（线上原样）。
这一点与本仓库 2026-08-11 之前的约定相反 —— 早期用的是 `hunger`（越大越饿，0–100），
迁移时改为线上界面已在用的「饱腹」并沿用 0–5：方向一致能消除公式与断言里的反向错误，
沿用 0–5 能让线上 JSON 导入成为恒等映射，不必推断刻度换算。
`hunger` 现为禁用词。

「1 份宠物粮」是界面说法，实际扣 2 点 `petFood`（线上 `Math.floor(petFood / 2)` 算份数）。
写规格时一律用点数，不要用「份」当单位。

## 时间

| 中文         | 标识符         | 含义                                      | 禁用词                               |
| ------------ | -------------- | ----------------------------------------- | ------------------------------------ |
| 当前时刻     | `now`          | 毫秒时间戳，**必须由调用方传入纯函数**    | `Date.now()` 直接调用、`currentTime` |
| 自然日       | `dayKey`       | `YYYY-MM-DD` 字符串，本机时区，日结算的键 | `date` / `today` / `ymd`             |
| 本周         | `weekKeys`     | 本周七个 `dayKey`，**周一为起点**         | `week` / `thisWeek` / `weekRange`    |
| N 天后       | `dayKeyAfter`  | 从 `now` 往后 N 天的 `dayKey`，`0` 是今天 | `addDays` / `nextDay` / `plusDays`   |
| 上次喂食时刻 | `lastFedAt`    | 毫秒时间戳                                | `feedTime` / `lastFeed`              |
| 上次陪玩时刻 | `lastPlayedAt` | 毫秒时间戳                                | `playTime` / `lastPlay`              |
| 离开时长     | `elapsedMs`    | 两个时刻之间的毫秒差                      | `duration` / `delta` / `diff`        |
| 衰减         | `decay`        | 数值随时间自然变差的过程                  | `decrease` / `drop` / `reduce`       |
| 连续天数     | `streak`       | 连续达标的自然日数，漏一天归零            | `combo` / `chain` / `continuousDays` |
| 今日全勤     | `allDone`      | 当日七条核心打卡项全部完成                | `perfect` / `fullMark` / `complete`  |
| 本周周键     | `weekKey`      | `weekKeys(now)[0]`，即本周周一的 `dayKey` | `weekId` / `weekStart` / `monday`    |
| 周奖励       | `weeklyBonus`  | 本周达标天数够数时发一次的星光与宝石      | `weekReward` / `bonus` / `weekly`    |

`dayKey` 是日结算的唯一键形式。禁止用毫秒时间戳当日期键，也禁止用 `Date` 对象 ——
存档必须能 `JSON.stringify` 后原样读回。

`weekKeys` 在 P6 落地（`utils/dayKey.js`，规格 `DAY-06` ~ `DAY-09`）。
**周一为起点**，周日归到它前面那个周一 —— 洗澡卡的「本周 N/3」与 P3-b 的周奖励
用的是同一份键。它只返回七个 `dayKey`，不返回「周一」这类星期文案（那是渲染的事）。

`dayKeyAfter` 在 P5 识字落地（同一个文件，规格 `DAY-10` ~ `DAY-12`）。
复习调度的「4 天后再出现」要它，古诗那一轮要的是同一个东西 —— 所以它是时间原语，
不属于识字域。`days` 必须是整数，`2.5` 天没有对应的日期键，抛 `RangeError`。

`lastFedAt` 在 P4 落进了存档（`pet.lastFedAt`，饱腹度衰减的基准）。
**`lastPlayedAt` 仍是一个只在本表里存在的词，没有存档字段也没有读取点** ——
开心度不随时间衰减（理由见 `docs/features/pet/doc.md`），所以它没有基准可言。
留在表里是为了钉住命名（真要做开心度衰减时不会又冒出 `lastPlay`），不是待办事项。

`allDone` 在 P3-b 落地，判据是**七条**核心打卡项（`wake` `brush-am` `literacy`
`reading` `exercise` `vegetables` `poop`），不是「全部打卡项」——
线上的八条里含 `bath`，而 `bath` 是唯一的周任务（`weeklyTarget: 3`），
要求它每天打满与它自己的定义矛盾。理由见 `docs/features/reward/doc.md`。

`weekKey` 是 `weekKeys(now)[0]`，本仓库不为它单独写函数 —— 周奖励的水位
（`lastWeeklyBonusWeek`）与「本周达标了几天」用的是同一份七个键。
P5 古诗的「本周三首」（`learningProgress.guoxue.weekly.weekKey`）是第三个用它的地方，
所以全仓只有一个「本周」的口径 —— 线上的选诗用 `floor(天序号 / 7)`，
而纪元 1970-01-01 是**周四**，于是线上有两套周边界。

## 动作

| 中文     | 标识符    | 含义                                 | 禁用词                                       |
| -------- | --------- | ------------------------------------ | -------------------------------------------- |
| 打卡     | `check`   | 标记某个 `checkItem` 今日完成        | `sign` / `signIn` / `punch` / `mark`         |
| 取消打卡 | `uncheck` | 撤回今日的一次打卡                   | `cancel` / `undo` / `revert`                 |
| 兑换     | `redeem`  | 用勋章换 `reward`，产生 `redemption` | `exchange` / `buy` / `purchase`              |
| 抽贴纸   | `draw`    | 抽取一张 `sticker`                   | `gacha` / `lottery` / `roll` / `spin`        |
| 解锁     | `unlock`  | 成就达成                             | `achieve` / `complete` / `earn`              |
| 喂食     | `feed`    | 提高 `fullness`，消耗 2 点 `petFood` | `eat` / `giveFood`                           |
| 陪玩     | `play`    | 提高 `mood`                          | `interact` / `pet`（`pet` 是名词，不作动词） |
| 睡着     | `asleep`  | 长期未打开后的休眠表现，可恢复       | `dead` / `gone` / `lost`（不做负面终局）     |

## 学习调度

识字与古诗共用同一套「学 → 复习 → 掌握」**术语**，但**调度实现各自独立**：

| 中文     | 标识符       | 含义                                 | 禁用词                                 |
| -------- | ------------ | ------------------------------------ | -------------------------------------- |
| 未学     | `unseen`     | 还没出现过                           | `new` / `todo` / `pending`             |
| 学习中   | `learning`   | 学过但未掌握，会进入复习队列         | `progress` / `wip` / `doing`           |
| 已掌握   | `mastered`   | 识字的「我认识」/ 古诗的「会背啦」   | `done` / `known` / `finished` / `pass` |
| 错题     | `wrong`      | 判定为「还不太会」，提高出现频次     | `error` / `fail` / `miss`              |
| 复习队列 | `reviewList` | 当次要复习的条目集合                 | `queue` / `repeat` / `again`           |
| 每日新量 | `dailyNew`   | 当天新引入的条目数上限               | `newCount` / `limit` / `quota`         |
| 复习档位 | `step`       | 连续答对的次数，答对进一档、答错回 0 | `level` / `stage` / `interval`         |
| 到期日   | `due`        | 下次出现的 `dayKey`，空串即立刻      | `dueDate` / `nextReview` / `at`        |

**「共用同一套调度」曾写在这里，是错的**（P5 识字这一轮逐条核对线上 bundle 后改的）：
线上识字按字排 1/2/4/7/14/30 六档、有错误计数，古诗按周轮换 3 首、到期上限 2、
只在首次学习时写一次调度、没有错误计数。两条路径在线上就是分开的，本仓库沿用分开 ——
`step` 与 `due` 这两个词识字先用（`docs/features/literacy/doc.md`），
古诗那一轮如果排期形状不同，用同样的词但可以有不同的档位表。

**P5 古诗用的就是「同样的词、不同的档位表」**：识字六档跨 58 天、`step` 上界 `7`；
古诗四档 `[1, 3, 7, 15]` 跨 26 天、`step` 上界 `5`（`docs/features/poem/doc.md`）。
两者的流量差近五倍（每天 2 个字 vs 每周 3 首），所以档位疏密不同。
古诗多一个 `mastered` 字段，与 `step` 到顶说的是同一件事 —— 刻意的冗余，
因为 `utils/reward.js` 的成就判据不能 import `poem.js`。

**P5 数学是第三个学习子模块，但它连词都不共用**：`step` 与 `due` 在数学里**不出现**
（`docs/features/math/doc.md`）。数学是 30 道固定题，线上就没有复习调度，
「明天再见」由「优先出还没答对过的题」自然完成 —— 没有间隔表，也就没有档位与到期日。
所以 `utils/save.js` 里只有两个档位上界常量（`STEP_MAX` / `POEM_STEP_MAX`）而不是三个，
数学那个 `MATH_STAGE_MAX = 6` 是**阶段数**，不是第三个上界。
数学的「学过没有」落在 `mathRound` 的 `correct` 上，它是终态：答对过之后再答错也不退回
（对照 `step` 答错回 `0`）—— 五岁孩子那 30 道题的目的是「都做对过一次」，不是保持熟练度。

古诗的分级沿用线上数据包字段：`grade`（学段）与 `tier`（`required` 必背 / 拓展）。
这两个是**数据字段名**，不改写成中文语义的新名字。中文标签（`启蒙` / `一年级` /
`二年级+`、`必背` / `拓展`）由 `utils/poem.js` 映射给页面，不进 `data/`。

## 家长端

| 中文         | 标识符           | 含义                                                | 禁用词                                           |
| ------------ | ---------------- | --------------------------------------------------- | ------------------------------------------------ |
| 家长 PIN     | `pin`            | **明文 4 位数字**，进家长端要输对它                 | `password` / `passcode` / `secret`               |
| 每日目标     | `dailyGoal`      | 当天完成几项算达标，`1` ~ `12`                      | `goal` / `target` / `dailyTarget`                |
| 家长备注     | `note`           | 只在家长端显示的一段文字                            | `memo` / `remark` / `comment`                    |
| PIN 错误次数 | `pinFails`       | 连续输错次数，验对即清零，`0` ~ `5`                 | `retry` / `attempts` / `failCount`               |
| PIN 冷却到期 | `pinLockedUntil` | 冷却结束的毫秒时间戳，`0` = 没在冷却                | `lockUntil` / `cooldown` / `bannedUntil`         |
| 任务启用     | `enabled`        | 布尔。停用的任务不出现在首页，也不计进分母          | `active` / `visible` / `on` / `disabled`         |
| 核心任务     | `core`           | 布尔。是否算进「今日全勤」那份名单                  | `required` / `isMain` / `important`              |
| 任务顺序     | `sortOrder`      | 正整数，首页与家长端的显示次序                      | `order` / `index` / `position` / `seq`           |
| 兑换卡开关   | `rewardFlags`    | 存档顶层键，`rewardId` → 布尔，**缺键 = 启用**      | `rewardEnabled` / `disabledRewards` / `switches` |
| 已取消兑换   | `'cancelled'`    | `redemptions[].status` 的第三个取值，家长驳回后落它 | `rejected` / `refused` / `denied` / `refunded`   |
| 达标日       | `qualified`      | 当天核心任务完成 ≥ `5` 条（周奖励与看板同一个判据） | `passed` / `ok` / `success` / `goodDay`          |
| 有没有记录   | `hasRecord`      | 看板日历那一格当天在 `days` 里有没有键              | `empty` / `isNull` / `missing`                   |

`enabled` / `core` / `sortOrder` / `rewardFlags` 四条是 P7 第二段登记的，都是**家长端才有
写入路径**的字段（`utils/parentTasks.js`），所以登记在本节而不是「实体」——
`habit` 的其余字段见 `docs/features/habit/doc.md`。

`'cancelled'` / `qualified` / `hasRecord` 三条是 P7 第三段登记的，**只有第一条是存档字段**：
后两个是 `utils/parentReport.js` 的**读取输出**，存档里没有对应的键，每次进看板现算
（`qualified` 由 `isQualifiedDay` 判、`hasRecord` 只看 `days` 里有没有那个键）。
它们仍登记在家长端这一节 —— 词是给家长端的界面用的，别的地方不出现这两个字。

**`enabled` 与「删除」不是一回事。** 家长端**不做删除任务**（`PARENT` 区范围外）：
停用是软删除，`days` 里历史打卡记录仍指着那个 id。硬删会让
`utils/habit.js::findHabit` 抛 `RangeError` —— 取消一条已删任务的打卡就白屏。

**`core` 只是一个字段，不是一份名单。** P3-b 刻意把全勤名单从 `utils/` 的平行数组
搬到任务元素上（家长停用一条核心任务后，平行数组会让全勤永久不可达）。
因此导入线上存档时 `core` 全落 `false`（`IMPORT-17`）——
在 `importOnline.js` 里写一张 id → `core` 的对照表，等于把那份名单又建了一遍。

**`sortOrder` 只经 `moveHabit` 改**，家长端没有输入框直接填数字：
每次上移/下移都把整个数组重排成连续的 `1..N`（按 `habit` → `learning` → `health`）。
线上 `addTask` 用 `tasks.length + 1` 当序号，删过任务之后必然与既有的撞。

**`rewardFlags` 是「缺键 = 启用」**，不是「缺键 = 停用」：写成后者会让存档里
还没有这个键的用户一张卡都换不了。读取侧因此一律判 `!== false`（`REWARD-16`）。

`pin` **存明文**，与线上一致：存档是本机 storage 的一条记录，能读到 storage 的人
能读到里面任何东西 —— 哈希只防孩子，而孩子看不到 storage。所以**忘了 PIN 只能清空数据**，
不做找回（`docs/features/parent/doc.md`；`docs/vision.md` 那条 `待确认` 于 P7 拍成定论）。

`pinFails` / `pinLockedUntil` 是**水位不是设置项**：由 `utils/parent.js` 的 `verifyPin`
累加与清零，家长端没有输入框能改它们。它们是本仓库比线上多出来的一层节流
（连错 5 次冷却 60 秒），线上输错无限次 —— 所以导入时两个都落 `0`（`IMPORT-16`）。
冷却期内**不累加也不延长**，否则乱点能把 60 秒变成永久。

`dailyGoal` 的上界 `12` 在 `normalizeSave` 里夹（`SAVE-19`）。线上那道
`Math.min(12, …)` 只在设置页里，导入一份 `dailyGoal: 99` 的存档能绕过去。

最后三条是 P7 第三段登记的。**`'cancelled'` 不叫 `'rejected'`**，尽管线上那个字段
就叫 `rejected`：本仓库这个状态有两种来历，家长驳回的那些**退过勋章**，
而从线上映射来的 `rejected` 记录**从来没被扣过**（线上批准时才扣，本仓库申请即扣）。
「已取消」是两边都成立的那句话，「已退回」不是（`SAVE-24` / `REWARD-18` / `IMPORT-12`）。

**「达标日」全仓只有一个判据**，就是 `utils/point.js::isQualifiedDay`。线上有三套口径
都叫「本周」（核心项 5/8、任意一项完成、自律+学习的 60%），同一份数据能给出
`2` / `7` / `false` 三个答案。所以看板的「本周达标 N 天」与周奖励发不发是同一个数 ——
家长看到 `4/5` 就知道还差一天（`PARENT-59`）。

**`hasRecord` 区分的是「没有数据」与「一项都没完成」。** 存档里没有「上周三有哪些任务
启用着」这笔数据，所以任何一天的分母只能是今天那个数 —— 这是近似值，
而近似值要标出来它是近似值：没有记录的那天页面显示「—」，不显示 `0/18`
（线上显示后者，`PARENT-58`）。

## Spec ID 区名

规格 ID 格式 `<AREA>-<NN>`，已分配的区名：

| 区名       | 覆盖范围                                         |
| ---------- | ------------------------------------------------ |
| `SAVE`     | 存档结构、默认值、读写、版本迁移                 |
| `IMPORT`   | 线上 JSON 一次性导入与字段映射                   |
| `DAY`      | 自然日结算、`dayKey` 生成、跨日判定              |
| `HABIT`    | 自律任务与打卡（含取消、连续天数）               |
| `POINT`    | 星光 / 宝石 / 宠物粮 / 勋章的产出与消耗          |
| `REWARD`   | 奖励项与兑换流程、兑换状态流转                   |
| `STICKER`  | 贴纸抽取、稀有度权重、免费次数、图鉴收藏         |
| `ACHV`     | 成就达成判定与解锁                               |
| `PET`      | 宠物等级、形象、喂食与陪玩                       |
| `FULLNESS` | 饱腹度计算与衰减                                 |
| `MOOD`     | 开心度计算（本仓库不做开心度衰减）               |
| `LEARN`    | 学习入口页与五个子模块共用的打卡链               |
| `LITERACY` | 识字学习与复习调度                               |
| `POEM`     | 古诗学习与复习调度                               |
| `MATH`     | 数学阶段、关卡与 Boss 通关                       |
| `READ`     | 阅读打卡                                         |
| `ENG`      | 英语打卡                                         |
| `HEALTH`   | 健康记录（饮食、糖、水果、水、便便、洗澡、运动） |
| `PARENT`   | 家长端 PIN、设置、任务管理、规则、报告           |
| `GREET`    | 时段问候语                                       |

新增区名先加到本表，再在 `doc.md` 中使用。

`HUNGER` / `HATCH` / `FEED` / `PLAY` 曾在 2026-08-11 前分配过，现已废弃：
饱腹度归入 `FULLNESS`，喂食与陪玩归入 `PET`，孵化流程不再是产品的一部分。
不要复用这四个区名。
