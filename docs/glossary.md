# 领域术语字典

> AI 在生成代码、文档、注释、测试名时**必须**使用本表中的词，不得自创同义词。
> 新增术语必须同步更新本文件（见 `AGENTS.md` 第 2 节）。
> 「禁用词」列出的是容易被自动生成的错误同义词，出现即视为不合规。

本表的标识符是**本仓库的规范命名**。线上工作台（见 `docs/vision.md`「前身」）的存档字段名
与本表可能不同，两者的映射关系在 `docs/features/storage/doc.md` 里给出，
**不要**直接把线上字段名当作本仓库标识符使用。

## 实体

| 中文       | 标识符        | 含义                                                                     | 禁用词                                           |
| ---------- | ------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| 存档       | `save`        | 落到 storage 的持久化数据，全局单例                                      | `profile` / `record` / `db` / `state`            |
| 孩子昵称   | `childName`   | 家长设置的显示名，默认 `nono`                                            | `userName` / `nickname` / `kidName`              |
| 打卡项     | `checkItem`   | 首页可打卡的一项（识字、刷牙……）                                         | `task`（`task` 专指家长端可编辑的自律任务）      |
| 自律任务   | `habit`       | 家长端可增删的习惯项，是 `checkItem` 的来源                              | `routine` / `todo` / `chore`                     |
| 奖励       | `reward`      | 可用勋章兑换的项（零食、动画片、零花钱）                                 | `prize` / `gift` / `item`                        |
| 兑换记录   | `redemption`  | 一次兑换请求及其状态                                                     | `order` / `exchange` / `log`                     |
| 贴纸       | `sticker`     | 抽取获得的收藏物，有类别与稀有度                                         | `card` / `badge` / `collectible`                 |
| 成就       | `achievement` | 达成条件后解锁，一次性                                                   | `medal`（`medal` 是货币）/ `trophy` / `badge`    |
| 宠物       | `pet`         | 陪伴主角，全局唯一，形象可更换                                           | `animal` / `creature` / `nono`（nono 是孩子）    |
| 宠物状态   | `petState`    | 某一时刻宠物的完整可观测状态                                             | `status` / `petInfo` / `petData`                 |
| 汉字       | `character`   | 汉字库中的一条（含拼音、组词、例句）                                     | `word` / `hanzi` / `char`（`char` 是它的字段名） |
| 古诗       | `poem`        | 古诗库中的一首                                                           | `poetry` / `verse` / `shi`                       |
| 数学阶段   | `mathStage`   | 共六个阶段，见 `docs/features/storage/doc.md`                            | `level` / `chapter` / `unit`                     |
| 关卡       | `mathRound`   | 阶段内的一道题，每阶段 4 普通 + 1 Boss                                   | `question` / `quiz` / `game`                     |
| 打卡流水   | `ledgerEntry` | 一次货币增减的记录，挂在当天的存档下                                     | `transaction` / `history` / `log`                |
| 学习子模块 | `module`      | 五个学习子页之一：`literacy` / `reading` / `guoxue` / `math` / `english` | `subject` / `subCategory` / `lesson`             |
| 学习记录   | `learningLog` | 当天某个学习子模块填写的内容（书名、时长……）                             | `detail` / `entry` / `form`                      |
| 共读方式   | `mode`        | 阅读的两种方式：`together` 亲子共读 / `solo` 独立阅读                    | `type` / `kind` / `style`                        |
| 健康记录   | `healthLog`   | 当天的健康记录（饮食、便便、洗澡、运动共十一个字段）                     | `healthData` / `healthRecord` / `daily`          |
| 便便心情   | `poopIcon`    | 三个 emoji 之一：😊 😐 😣，选一个即记了一次便便                          | `poopMood` / `emoji` / `feeling`                 |

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
| 上次喂食时刻 | `lastFedAt`    | 毫秒时间戳                                | `feedTime` / `lastFeed`              |
| 上次陪玩时刻 | `lastPlayedAt` | 毫秒时间戳                                | `playTime` / `lastPlay`              |
| 离开时长     | `elapsedMs`    | 两个时刻之间的毫秒差                      | `duration` / `delta` / `diff`        |
| 衰减         | `decay`        | 数值随时间自然变差的过程                  | `decrease` / `drop` / `reduce`       |
| 连续天数     | `streak`       | 连续达标的自然日数，漏一天归零            | `combo` / `chain` / `continuousDays` |
| 今日全勤     | `allDone`      | 当日全部打卡项完成                        | `perfect` / `fullMark` / `complete`  |

`dayKey` 是日结算的唯一键形式。禁止用毫秒时间戳当日期键，也禁止用 `Date` 对象 ——
存档必须能 `JSON.stringify` 后原样读回。

`weekKeys` 在 P6 落地（`utils/dayKey.js`，规格 `DAY-06` ~ `DAY-09`）。
**周一为起点**，周日归到它前面那个周一 —— 洗澡卡的「本周 N/3」与 P3-b 的周奖励
用的是同一份键。它只返回七个 `dayKey`，不返回「周一」这类星期文案（那是渲染的事）。

`lastFedAt` 在 P4 落进了存档（`pet.lastFedAt`，饱腹度衰减的基准）。
**`lastPlayedAt` 仍是一个只在本表里存在的词，没有存档字段也没有读取点** ——
开心度不随时间衰减（理由见 `docs/features/pet/doc.md`），所以它没有基准可言。
留在表里是为了钉住命名（真要做开心度衰减时不会又冒出 `lastPlay`），不是待办事项。

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

识字与古诗共用同一套「学 → 复习 → 掌握」调度，术语统一：

| 中文     | 标识符       | 含义                               | 禁用词                                 |
| -------- | ------------ | ---------------------------------- | -------------------------------------- |
| 未学     | `unseen`     | 还没出现过                         | `new` / `todo` / `pending`             |
| 学习中   | `learning`   | 学过但未掌握，会进入复习队列       | `progress` / `wip` / `doing`           |
| 已掌握   | `mastered`   | 识字的「我认识」/ 古诗的「会背啦」 | `done` / `known` / `finished` / `pass` |
| 错题     | `wrong`      | 判定为「还不太会」，提高出现频次   | `error` / `fail` / `miss`              |
| 复习队列 | `reviewList` | 当次要复习的条目集合               | `queue` / `repeat` / `again`           |
| 每日新量 | `dailyNew`   | 当天新引入的条目数上限             | `newCount` / `limit` / `quota`         |

古诗的分级沿用线上数据包字段：`grade`（学段）与 `tier`（`required` 必背 / 拓展）。
这两个是**数据字段名**，不改写成中文语义的新名字。

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
| `STICKER`  | 贴纸抽取、稀有度权重、免费次数                   |
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
