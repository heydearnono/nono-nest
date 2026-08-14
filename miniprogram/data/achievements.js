/**
 * 成就表：十一条，从线上工作台的成就常量原样转抄。
 *
 * 判据表与取舍见 docs/features/reward/doc.md（`ACHV` 区）。
 *
 * `condition` 是字符串，判据函数在 `miniprogram/utils/reward.js` 里按它分派
 * （与 `utils/health.js` 的 `FIELDS` 注册表同构）：常量表只说「用哪条判据」，
 * 怎么算在 utils 里。加一条成就 = 这里加一行 + 那边加一个判据函数。
 *
 * **id 不可改**：`save.achievements` 里已解锁的 id 是按这些值存的（线上的
 * `unlockedMedals` 也是），改 id 等于把已解锁的成就重新锁上。
 *
 * `char-50` 的 `description` 是**唯一改过字的一条**：线上写「认识50个汉字」，
 * 数的是 `masteredChars`；本仓库数「学过」（`chars` 的键数），因为本仓库的
 * 「已掌握」要熬完六个间隔跨 58 天，照线上抄这条成就头两个月不可达。
 * 理由写在 docs/features/reward/doc.md，规格是 `ACHV-05`。
 *
 * `poem-10` / `math-10` 依赖还没做的模块，进度恒 0 —— 判据照样跑，只是返回 0。
 *
 * 本文件是常量区（AGENTS.md 第 3 节）：零函数、零判断、零计算。
 */
export const ACHIEVEMENTS = [
  {
    id: 'early-bird',
    name: '早起小明星',
    icon: '🌅',
    description: '连续早起3天',
    condition: 'habit_wake',
    threshold: 3,
  },
  {
    id: 'brush-7',
    name: '刷牙小卫士',
    icon: '🪥',
    description: '连续早上刷牙7天',
    condition: 'habit_brush',
    threshold: 7,
  },
  {
    id: 'read-5',
    name: '阅读小能手',
    icon: '📖',
    description: '阅读打卡5天',
    condition: 'reading_days',
    threshold: 5,
  },
  {
    id: 'char-50',
    name: '识字小达人',
    icon: '🔤',
    // 线上是「认识50个汉字」（数已掌握），本仓库数学过 —— 见头注释与 ACHV-05
    description: '学过 50 个汉字',
    condition: 'chars_learned',
    threshold: 50,
  },
  {
    id: 'poem-10',
    name: '古诗小诗人',
    icon: '📜',
    description: '背会10首古诗',
    condition: 'poems_mastered',
    threshold: 10,
  },
  {
    id: 'math-10',
    name: '数学小玩家',
    icon: '🔢',
    description: '完成10次数学游戏',
    condition: 'math_games',
    threshold: 10,
  },
  {
    id: 'veggie-5',
    name: '爱吃青菜',
    icon: '🥬',
    description: '一周吃青菜5天',
    condition: 'veggie_week',
    threshold: 5,
  },
  {
    id: 'tidy-5',
    name: '整理小队长',
    icon: '🏠',
    description: '整理房间5次',
    condition: 'room_tidy',
    threshold: 5,
  },
  {
    id: 'full-week',
    name: '一周全勤',
    icon: '⭐',
    description: '一周打卡达标5天',
    condition: 'full_week',
    threshold: 1,
  },
  {
    id: 'pet-5',
    name: '宠物好朋友',
    icon: '🦄',
    description: '宠物升到5级',
    condition: 'pet_level',
    threshold: 5,
  },
  {
    id: 'daily-3',
    name: '打卡小能手',
    icon: '🌟',
    description: '累计3天今日全勤',
    condition: 'daily_all_done',
    threshold: 3,
  },
];
