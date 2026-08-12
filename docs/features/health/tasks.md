# 健康记录（饮食 · 便便 · 洗澡 · 运动）· 实施清单

顺序按依赖：先补 `DAY` 区的 `weekKeys`（健康的周计数要用它），再术语，
再纯函数与测试，最后页面与 tabBar。`health.js` import `pet.js` 与 `dayKey.js`，反向不许。

## 1. `weekKeys` 落进 `DAY` 区

- [x] `docs/features/storage/doc.md`：已加 `weekKeys` 一节与 `DAY-06` ~ `DAY-09`（先文档后代码）
- [x] `miniprogram/utils/dayKey.js`：加 `weekKeys(now)`，周一为起点、周日走 `-6`
- [x] 复用已有的 `dayKey` 做格式化，不写第二套补零
- [x] 非有限数 `now` 抛 `TypeError`（与 `dayKey` 同一条）
- [x] `tests/dayKey.test.js` 补 `DAY-06` ~ `DAY-09`，含周日与跨年两条

## 2. 术语

- [x] `docs/glossary.md`：实体表加 `healthLog` / `poopIcon`，时间表加 `weekKeys`（已完成）
- [x] `HEALTH` 区名早在 P2 就已登记，不重复加

## 3. 健康纯函数

- [x] 写 `miniprogram/utils/health.js`：`healthState` / `toggleHealth` / `setHealth`
- [x] 一张字段表：`kind`（`bool` / `count` / `pick`）、`habitId`、`turnsOn`、`max` / `values`
- [x] 四个 `habitId` 非空的布尔字段走发放 / 退回，其余只写记录
- [x] 发放先行、记录后写（`day` 从 `awarded` 里取），与 `completeLearning` 相反
- [x] `checkAwardAndGrow` 不传第五参数（经验就是默认的 5，本区无新常量）
- [x] `toggleHealth` 不收 `value`，反转自己算；传取值字段抛 `RangeError`
- [x] `setHealth` 传布尔字段抛 `RangeError`；`poopIcon` 越界抛 `RangeError`
- [x] `setHealth` 写入同值且蕴含开关已开时原样返回（对象同一性）
- [x] `healthState` 返回 `log` / `bathWeek` / `poopIcons` / `sugarMax`，缺任务时 `bathWeek` 为 `null`
- [x] `bathWeek.done` 数 `checks`，不数 `health.bath`（线上两个都数是历史遗留）

## 4. 测试

- [x] 写 `tests/health.test.js`，覆盖 `HEALTH-01` ~ `20`
- [x] `HEALTH-03` 断言经验 +5 而不是学习的 8（与 `LEARN-08` 成对）
- [x] `HEALTH-04` 断言退回后 `checks` 的键被删、流水第二条是 `取消：吃青菜`
- [x] `HEALTH-05` 断言 `fruit` 只写记录，货币 / 流水 / `checks` 一动不动
- [x] `HEALTH-11` / `HEALTH-13` 断言蕴含开关连带发放，`HEALTH-14` 断言不重复发放
- [x] `HEALTH-17` 造两天 `checks.bath` 再断言 `{ done: 2, target: 3 }`
- [x] `HEALTH-20` 断言 `checks` / `ledger` / `health` 三个兄弟键互不覆盖

## 5. 页面与 tabBar

- [x] `miniprogram/pages/health/` 四个文件：四张卡片
- [x] 饮食卡：`lessSugar` 开关 + 糖数（`sugarMax` 来自 `healthState`）+ 三个开关
- [x] 便便卡：`poopIcons` 渲染三个 emoji，选中的加圈，页面不写那三个字符
- [x] 洗澡卡：标题带「本周 N/3」，`bathWeek` 为 `null` 时不显示计数
- [x] 运动卡：`exercise` 开关 + 分钟数（只在开关打开时露出）
- [x] `app.json` 加 page 与 tabBar 第四项（`🥗 健康` 插在学习与小伙伴之间），不用图片图标
- [x] `onShow` 取数（tab 页），落盘前判 `next === this.save`
- [x] `health.wxss` 头注释记下「不抽公共层」的判断（健康页不是第三个表单页）

## 6. 收尾

- [x] 跑 `npm run format`，再跑 `npm run check`，全绿
- [x] 写 `summary.md`：实际做法、与 `doc.md` 的偏差、对 P3-b 的影响
- [x] `docs/vision.md` 的 P6 行改成「已完成」
- [x] 留档本次 prompt 到 `prompts/runs/`
