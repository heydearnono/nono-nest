# 宠物：饱腹度、开心度、成长

- 区名：`PET`（喂食、经验、等级、形象）、`FULLNESS`（饱腹度衰减）、`MOOD`（开心度）
- 模块：`miniprogram/utils/pet.js`、`miniprogram/data/petTypes.js`、`miniprogram/pages/pet/`
- 状态：已完成（见 `summary.md`）
- 关联愿景：`docs/vision.md` P4

## 背景

宠物是四件事（学习、自律、健康、奖励）的情绪出口，不是产品本体
（`docs/vision.md`「是什么」）。P3-a 让打卡产出了星光与宠物粮，但宠物粮此刻**没有去处** ——
`save.pet` 从 P1 起就躺在存档里，一次都没被读写过。本 feature 接上它。

线上的对应实现（从 bundle 逆向，已核对）：

| 项       | 线上做法                                                                               |
| -------- | -------------------------------------------------------------------------------------- |
| 喂食     | `feedPet`：`satiety >= 5` 或 `foodPoints < 2` 时只弹提示；否则扣 2 点、饱 +1、经验 +10 |
| 陪玩     | `playWithPet`：`happiness >= 5` 时什么都不做；否则开心 +1、经验 +5                     |
| 打卡     | `ko`（toggleTask）：经验 +5，且 `happiness = Math.min(5, happiness + 1)`               |
| 取消打卡 | `Oo`：只退货币，**不动经验与开心度**                                                   |
| 升级     | `while (exp >= level * 100) { exp -= level * 100; level += 1 }`                        |
| 等级称号 | `Or(level)`：`>=5` 魔法伙伴 / `>=4` 小书包伙伴 / `>=3` 可爱装饰 / `>=2` 成长中 / 幼年  |
| 形象     | `selectPet(type)`：`type` 与 `name` 一起改，5 个可选                                   |
| 饿的表现 | `satiety <= 2` 时切 `hungry` 动画并挂一个「饿饿」角标                                  |
| 衰减     | **没有。** `lastFedAt` / `lastPlayed` / `decay` 在整个 bundle 里 0 次出现              |

## 设计

### 最大的偏差：加上饱腹度衰减，且只衰减饱腹度

线上的 `satiety` 只会因喂食上升，永不下降。后果是：连点几次喂食就永久饱着，
宠物粮失去用途，「照顾一只小伙伴」这件事不成立 —— 而这正是
`docs/vision.md`「什么算好」第 1 条（驱动力是「小伙伴在等我」）依赖的东西。

所以本仓库**主动加一条线上没有的规则**：饱腹度随时间衰减，每 6 小时 -1，下限 0。
这是人拍板的产品决定（2026-08-12），不是逆向所得，因此写在这里而不是当成迁移细节。

**开心度不衰减。** 两者的语义不同：

| 项     | 衰减 | 理由                                                                             |
| ------ | ---- | -------------------------------------------------------------------------------- |
| 饱腹度 | 会   | 「饿了要喂」是照顾，孩子能理解也能立刻解决（打卡赚粮 → 喂食）                    |
| 开心度 | 不会 | 「你不陪我我就难过」是情绪绑架，与「温和，不惩罚」冲突，而且孩子无法「补上」昨天 |

衰减的下限是 0，且**不掉等级、不掉经验、不清零进度** —— 对应
`docs/vision.md`「什么算好」第 2 条与「明确不做」的负面终局条款。
饿到 0 的唯一表现是界面上的「饿饿」角标，没有任何数值损失。

### 衰减写进存档，不在读取时算

`fullness` 的衰减需要一个基准时刻，所以存档新增 `pet.lastFedAt`（毫秒数）。
两种实现路线：

| 路线                               | 取舍                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| 读取时算（存档只存喂食那一刻的值） | 存档不必写，但「当前饱腹度」这个数在每个读取点各算一遍，且喂食要先算一遍再加 |
| **结算后写回（本仓库选这条）**     | 衰减在 `settleFullness` 一处发生，其余代码读 `save.pet.fullness` 即是当前值  |

`settleFullness(save, now)` 的三条细节，每条都对应一个规格：

1. **`lastFedAt` 前进的是整数个 6 小时，不是直接置成 `now`。**
   置成 `now` 会把不足 6 小时的余量抹掉 —— 每 5 小时打开一次小程序，宠物就永远不会饿。
2. **`lastFedAt === 0` 视为「还没有基准」**：不衰减，只把 `lastFedAt` 立成 `now`。
   首次进入与导入线上存档都落在这一支（线上没有这个字段），
   否则 `now - 0` 是个巨大的差值，一进来就看到饿瘪的宠物。
3. **`now` 早于 `lastFedAt`（时钟回拨）时原样返回**，不倒着加饱腹度。

结算的触发点是**宠物页的 `onShow`**，不是每次读存档。首页不结算：饱腹度只在宠物页显示，
在看不见它的地方写存档没有意义。因为衰减量由 `now - lastFedAt` 算出，
「隔三天才打开宠物页」与「每天打开」得到的结果相同，少开不占便宜。

### `days` 不参与

喂食与陪玩**不写 `days[dayKey]`**，因此没有「今天喂了几次」的记录，也没有次数上限。
理由：宠物粮本身就是上限（一次 2 点，靠打卡赚），再加一层每日次数是两套限制。
线上同样没有。代价是家长端（P7）的每日报告看不到喂食次数 —— 届时若要看，
在 `PET` 区加流水，不要去翻 `days`。

### `utils/pet.js` 的六个纯函数

```js
settleFullness(save, now)      -> save      // 饱腹度按 6h 步长结算，幂等
petState(save, now)            -> petState  // 宠物页唯一的读取入口
feed(save, now)                -> save      // 扣 2 点粮、饱腹 +1、经验 +10
play(save, now)                -> save      // 开心 +1、经验 +5
choosePet(save, type)          -> save      // 换形象，名字跟着换
checkAwardAndGrow(save, dayKey, habitId, now, gainedExp?) -> save  // 打卡 + 发放 + 成长
```

`checkAwardAndGrow` 的第五参数 `gainedExp` 默认 `5`（自律打卡）。P5 落地时学习打卡要给 8，
由调用方传入 —— `pet.js` 认识 `habitId` 会让它反向依赖 `data/defaultHabits.js`
（见 `docs/features/learning/doc.md` 的 `LEARN-08`）。默认值即本区原行为，
所以下面的 `PET-15` / `MOOD-01` / `MOOD-04` 断言的仍是 5。

依赖方向 `pet.js → point.js → habit.js → data/`，无环。

**`checkAwardAndGrow` 包在 `point.js` 外面，不改 `checkAndAward`。**
这是 `docs/features/point/summary.md` 留下的约束：升级是个 `while` 循环，
塞进发放函数会让 `POINT-01`（打卡产出 1 星 1 粮）的断言范围悄悄扩大到宠物等级。
幂等仍靠对象同一性 —— `checkAndAward` 幂等时返回入参本身，所以：

```js
const awarded = checkAndAward(save, key, habitId, now);
if (awarded === save) return save; // 这次没有新打卡，不涨经验也不涨开心
```

**取消打卡没有对应的外层函数。** 撤回只退货币（`uncheckAndRefund`），
**不收回经验、不降开心度** —— 与线上一致，也是「温和，不惩罚」的直接推论。
所以页面里打卡走 `pet.js`、取消走 `point.js`，两边不对称是有意的。

### `petState`：页面的唯一读取入口

按 `AGENTS.md` 第 3 节，页面里不能写阈值。「饱腹度低到该显示饿饿角标了」
「喂食按钮该灰掉」都是阈值判断，所以由 `petState` 一次性给出：

```js
{
  type: 'unicorn',
  name: '彩虹',
  emoji: '🦄',
  petLevel: 1,
  levelTitle: '幼年',
  petExp: 40,
  expToNext: 100,      // petLevel × 100
  expPercent: 40,      // 经验条宽度，页面里不写公式也不调 Math.round
  fullness: 3,         // 已结算，即当前值
  mood: 4,
  fullnessLow: false,  // fullness <= 2，界面显示「饿饿」
  petFood: 6,          // 货币余额，页面用它显示还能喂几次
  feedBlock: null,     // null | 'full' | 'noFood'
  playBlock: null,     // null | 'happy'
  types: [             // 形象选择行，current 标出当前选中的那个
    { type: 'unicorn', displayName: '彩虹独角兽', emoji: '🦄', current: true },
    // …共 5 条
  ],
}
```

`types` 也从这里出，而不是让页面自己 import `data/petTypes.js`：
依赖方向是 `pages → utils → data` 的链（`AGENTS.md` 第 3 节），页面跨过 `utils` 直接摸
常量区会绕开这条链；而且「哪一个是当前选中的」是一次比较，属于 `utils`。

`fullnessLow` 而不是 `hungry`：`hungry` 是 `docs/glossary.md` 的禁用词
（早期用过 `hunger`，方向与 `fullness` 相反，混用会写出反向的判断）。

`feedBlock` / `playBlock` 返回**原因码**而不是布尔值：页面要按原因选不同的提示语，
布尔值会让页面自己再判断一次「为什么不能喂」，阈值又回到页面里。
提示语的文案在页面（那是文案，不是规则），选哪一条由这两个字段决定。

### 喂食与陪玩的失败是「原样返回」，不是抛错

饱了还点喂食、粮不够还点喂食、已经最开心还点玩耍 —— 都是正常的用户状态，
不是编程错误，所以返回入参本身（对象同一性），由页面按 `feedBlock` / `playBlock` 提示。
抛错的只有两类：未知的宠物形象 `type`（`RangeError`）与非有限数的 `now`（`TypeError`），
它们都只可能来自代码写错（见 `AGENTS.md` 第 5 节第 6 条）。

**开心度满时点玩耍，经验也不涨**（线上如此：`if (!已满) { 开心 +1; 经验 +5 }`）。
但**打卡时开心度满，经验照涨 5** —— 打卡的经验是给「完成了一件事」的，
不是给「宠物变开心」的。两者刻意不一致，各有一条规格钉住。

### `data/petTypes.js`：5 个形象

```js
{ type: 'unicorn', name: '彩虹', displayName: '彩虹独角兽', emoji: '🦄' }
```

`type` 与 `emoji` 从线上 `ar` 数组原样抄；`name`（宠物的名字）抄自线上 `selectPet` 的
名字映射表 `{ unicorn: '彩虹', rabbit: '棉棉', cat: '咪咪', fox: '狐狐', panda: '胖胖' }`；
`displayName` 是选择列表上的那行小字（线上 `ar` 里的 `name`）。

线上把这两份数据放在两个地方（形象表与名字表），本仓库合成一张 ——
它们逐条一对一，分开放只会让下一个人以为可以不一致。

`choosePet` 会**覆盖 `pet.name`**：换形象等于换一只小伙伴，名字跟着走。
家长端改名字（P7）落地后，这条要重新评估 —— 那时改过名再换形象会丢掉自定义名。

### 宠物页

`pages/pet/` 一屏放下：大 emoji + 等级称号 + 经验条、饱腹与开心两条 0–5 的心心、
5 个形象的选择行、喂食与玩耍两个大按钮。`app.json` 加 tabBar（`🏠 首页` / `🐾 小伙伴`）。

tabBar **不用图片图标**，只用带 emoji 的文字：仓库里目前没有任何二进制资源，
为两个图标引入 png 会让「零依赖、纯文本仓库」这条不成立，收益只是图标好看一点。

## 行为规格

### 饱腹度衰减（`FULLNESS`）

| Spec ID     | 输入                                              | 期望输出                                                |
| ----------- | ------------------------------------------------- | ------------------------------------------------------- |
| FULLNESS-01 | `lastFedAt` 为 `0` 时 `settleFullness(save, now)` | 饱腹度不变，`lastFedAt` 立为 `now`（建立基准）          |
| FULLNESS-02 | 距上次喂食 6h，`fullness` 为 `3`                  | `fullness` 为 `2`，`lastFedAt` 前进 6h                  |
| FULLNESS-03 | 距上次喂食 5h59m                                  | 原样返回（同一性），`fullness` 与 `lastFedAt` 都不动    |
| FULLNESS-04 | 距上次喂食 13h，`fullness` 为 `5`                 | `fullness` 为 `3`，`lastFedAt` 只前进 12h（余 1h 不丢） |
| FULLNESS-05 | 距上次喂食 30h，`fullness` 为 `2`                 | `fullness` 收敛到 `0`，不为负                           |
| FULLNESS-06 | `now` 早于 `lastFedAt`（时钟回拨）                | 原样返回，不倒着加饱腹度                                |
| FULLNESS-07 | `settleFullness` 的 `now` 非有限数                | 抛 `TypeError`                                          |
| FULLNESS-08 | 同一个 `now` 连续 `settleFullness` 两次           | 第二次原样返回（幂等）                                  |

衰减步长 6 小时是拍板值：一天 4 格，饱腹度满格 5 意味着「吃饱后一天多不管就会饿」。
比 6 小时短会让宠物粮不够（一天最多赚 18 点 = 9 次喂食），比 6 小时长则一天喂一次就够，
饱腹度失去意义。

### 开心度（`MOOD`）

| Spec ID | 输入                                   | 期望输出                                                |
| ------- | -------------------------------------- | ------------------------------------------------------- |
| MOOD-01 | `checkAwardAndGrow` 打卡一项           | `mood` +1                                               |
| MOOD-02 | `play(save, now)`                      | `mood` +1                                               |
| MOOD-03 | `mood` 已是 `5` 时 `play`              | 原样返回，经验也不涨；`petState.playBlock` 为 `'happy'` |
| MOOD-04 | `mood` 已是 `5` 时 `checkAwardAndGrow` | `mood` 停在 `5`，但 `petExp` 仍 +5                      |
| MOOD-05 | 距上次喂食 30h 后 `settleFullness`     | `mood` 不变 —— 开心度不随时间衰减                       |
| MOOD-06 | 打卡后 `uncheckAndRefund` 取消         | `mood` 与 `petExp` 都不回退，只退货币                   |

### 喂食、成长与形象（`PET`）

| Spec ID | 输入                                                                  | 期望输出                                                                    |
| ------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| PET-01  | `petFood` 为 `6`、`fullness` 为 `3` 时 `feed`                         | `petFood` 为 `4`、`fullness` 为 `4`、`lastFedAt` 为 `now`                   |
| PET-02  | 同上                                                                  | `petExp` +10                                                                |
| PET-03  | `fullness` 已是 `5` 时 `feed`                                         | 原样返回，不扣宠物粮                                                        |
| PET-04  | `petFood` 只有 `1` 时 `feed`                                          | 原样返回，`fullness` 不涨                                                   |
| PET-05  | 距上次喂食 20h、`fullness` 为 `3` 时 `feed`                           | 先结算到 `0` 再 +1，结果 `fullness` 为 `1`                                  |
| PET-06  | `petExp` 为 `95`、`petLevel` 为 `1` 时 `feed`（+10）                  | `petLevel` 为 `2`、`petExp` 为 `5`                                          |
| PET-07  | `petExp` 为 `295`、`petLevel` 为 `1` 时 `play`（+5）                  | `petLevel` 为 `3`、`petExp` 为 `0`（一次跨两级）                            |
| PET-08  | `petLevel` 为 `1/2/3/4/5/9`                                           | `levelTitle` 为 幼年 / 成长中 / 可爱装饰 / 小书包伙伴 / 魔法伙伴 / 魔法伙伴 |
| PET-09  | `petLevel` 为 `3` 时 `petState`                                       | `expToNext` 为 `300`、`expPercent` 为 `petExp / expToNext` 的百分比         |
| PET-10  | `fullness` 为 `2` 与 `3` 时 `petState`                                | `fullnessLow` 分别为 `true` 与 `false`                                      |
| PET-11  | `petState` 的三种可喂状态                                             | `feedBlock` 为 `null` / `'full'` / `'noFood'`                               |
| PET-12  | 距上次喂食 12h、存档 `fullness` 为 `3` 时 `petState`                  | `fullness` 为 `1`（读到的是结算后的值）                                     |
| PET-13  | `choosePet(save, 'rabbit')`                                           | `type` 为 `'rabbit'`、`name` 为 `'棉棉'`、`emoji` 为 `🐰`                   |
| PET-14  | `choosePet(save, 'dragon')`（未登记的形象）                           | 抛 `RangeError`                                                             |
| PET-15  | `checkAwardAndGrow(save, dayKey, 'wake', now)`                        | 货币与流水与 `POINT-01`/`POINT-02` 一致，且 `petExp` +5                     |
| PET-16  | 对同一项连续两次 `checkAwardAndGrow`                                  | 幂等：`petExp`、`mood`、货币、流水都不再变                                  |
| PET-17  | `feed` / `play` / `choosePet` / `checkAwardAndGrow` 后检查入参 `save` | 未被改动（返回的是新对象）                                                  |
| PET-18  | `feed` / `play` / `checkAwardAndGrow` 的 `now` 非有限数               | 抛 `TypeError`                                                              |
| PET-19  | `petState().types`                                                    | 5 条，当前形象那条 `current` 为 `true`                                      |

等级称号沿用线上五档文案，包括读起来别扭的「可爱装饰」（线上原文，Lv.3）——
它是 nono 已经见过的字，改掉等于换掉她认识的东西。

## 范围外

- **不做开心度衰减。** 见上文的取舍表。因此**不引入 `pet.lastPlayedAt`**
  （`docs/glossary.md` 里有这个词，但本轮没有读取点，加了就是死字段）。
- **不做 `asleep`（长期未打开后的休眠表现）。** 饱腹度衰减已经承担了「久未照顾」的表达，
  再加一层休眠是第二套缺席信号，且它需要一个「多久算长期」的新阈值。
  真要做时它是纯表现层的，不改存档。
- **不做首页的宠物卡片。** 线上首页有一张宠物卡（等级 + 经验条 + 两条状态）。
  本轮宠物只在 tabBar 的第二个 tab 里，首页保持 P2 定下的「问候语 + 进度 + 货币带 + 格子」。
  加卡片要重排首页布局，与本轮的宠物规则无关。
- **不做喂食 / 陪玩的次数记录与每日上限。** 见上文「`days` 不参与」。
- **不做经验的来源扩展。** 本轮只有三个来源：打卡 +5、喂食 +10、陪玩 +5。
  线上数学打卡给 `{ exp: 8 }`、其它学习项各有差异 —— 那些在 P5 各自的 feature 里，
  届时调 `checkAwardAndGrow` 或给它加一个产出参数，不要在 `pet.js` 里按 `habitId` 分支。
- **不做宠物动画与粒子特效。** 线上有 `petAnim`（idle / happy / jump / play / hungry）与
  10 个 emoji 的爆开特效。WXSS 能做，但 `docs/vision.md`「与线上的已知差异」已写明
  过重的特效要降级。本轮只做「点一下宠物会缩放」这一档（`hover-class`）。
- **不做宠物改名。** `pet.name` 由 `choosePet` 决定，家长端改名在 `PARENT`（P7）。
- **不做等级上限。** `petLevel` 无上限，称号到 5 级就固定为「魔法伙伴」，与线上一致。
