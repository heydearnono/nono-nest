/**
 * 家长域的**只读**入口：看板与每日报告。
 *
 * 规格来源：docs/features/parent/doc.md（`PARENT` 区，第三段）
 *
 * **这个模块一个写函数都没有。** 家长域的六个写入口全在 `parentTasks.js` 里
 * （第二段五个 + 第三段的 `resolveRedemption`）。拆模块的判据不是「碰哪个字段」
 * —— 两个模块都读 `days` 与 `redemptions` —— 是**「它写不写盘」**。
 * 代价是 `parentTasks.js` 从此名不副实（它其实是「家长域的写入口」），
 * 不改名，这笔债记在 doc.md 里。
 *
 * 不 import `habit.js`：`dayProgress` 数的是首页九格（`category === 'habit'`），
 * 而看板与报告要的是**三类合计**。两个口径不同，所以是两个函数、两个名字，
 * 但都由 utils 给 —— 页面一个数都不自己数。
 *
 * 不 import 任何 `data/`：趋势与累计全从存档现算。
 */

import { dayKey, weekKeys } from './dayKey.js';
import { WEEKLY_BONUS, dayEarned, isQualifiedDay } from './point.js';

/** 识字「已掌握」的档位下界，与 `literacy.js` 的 `STEP_MAX` 同一个数 */
const MASTERED_STEP = 7;

/** 趋势柱子的三类，顺序即界面顺序（与 `defaultHabits.js` 的分段顺序一致） */
const TREND_CATEGORIES = ['habit', 'learning', 'health'];

/** 日历那一格上的星期文案。`weekKeys` 只给日期键，星期是渲染的事（glossary）*/
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 启用中的任务，三类合计。
 *
 * @param {object} save 存档
 * @returns {object[]} 任务定义
 */
function enabledHabits(save) {
  const habits = Array.isArray(save.habits) ? save.habits : [];
  return habits.filter((habit) => habit.enabled);
}

/**
 * 某天的 `checks`，没有那天就给空对象。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object} `{ [habitId]: { at } }`
 */
function checksOf(save, key) {
  const checks = save.days?.[key]?.checks;
  return typeof checks === 'object' && checks !== null ? checks : {};
}

/**
 * 某天有没有记录 —— **只看 `days` 里有没有那个键**。
 *
 * 与「一项都没完成」是两种不同的零：存档里没有「上周三有哪些任务启用着」这笔数据，
 * 所以任何一天的分母只能是今天那个数（近似值）。**近似值要标出来它是近似值** ——
 * 没有记录的那天页面显示「—」，不显示 `0/18`（线上显示后者，缺陷 13）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {boolean}
 */
function hasRecordOn(save, key) {
  const day = save.days?.[key];
  return typeof day === 'object' && day !== null;
}

/**
 * 非负整数，否则 `0`。
 *
 * @param {unknown} value 待收敛的值
 * @returns {number}
 */
function count(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * 一天里某一类的完成度百分比。
 *
 * 该类**一条都没启用时落 `0`**（照线上 `Sr`，.scratch/index-VUOSJfWA.js:244157）——
 * 「零个里完成了零个」在数学上没有百分比，而柱子高度必须是个数。
 *
 * @param {object[]} habits 启用中的任务（三类合计）
 * @param {object} checks 那天的 `checks`
 * @param {string} category 类别
 * @returns {number} 0 ~ 100 的整数
 */
function percentOf(habits, checks, category) {
  const list = habits.filter((habit) => habit.category === category);
  if (list.length === 0) return 0;

  const done = list.filter((habit) => habit.id in checks).length;
  return Math.round((done / list.length) * 100);
}

/**
 * 累计阅读分钟：**遍历 `days` 现算**，存档里没有累计字段。
 *
 * 线上那个 `reading.totalMinutes` 恒为 `0`（缺陷 16）—— 它是个只写不更新的死字段。
 * 本仓库不落一个累计水位：那种字段会与 `days` 分叉，而这里连「余额」语义都没有
 * （对照「流水是账、货币是余额」：没有余额语义的东西不存水位）。
 * 代价是 O(天数)，看板一天看一次，可以接受。
 *
 * @param {object} save 存档
 * @returns {number} 分钟数
 */
function readMinutesOf(save) {
  const days = typeof save.days === 'object' && save.days !== null ? save.days : {};

  let total = 0;
  for (const day of Object.values(days)) {
    total += count(day?.learning?.reading?.minutes);
  }
  return total;
}

/**
 * 看板的读取入口：今日四个数、本周七格、三条七日趋势、四格累计。
 *
 * **不抛错**（渲染宽容，与 `rewardState` 同一条）：脏存档只影响数值。
 *
 * @param {object} save 存档
 * @param {number} now 毫秒时间戳
 * @returns {{ today: object, week: object, trends: object, totals: object }}
 */
export function boardState(save, now) {
  const habits = enabledHabits(save);
  const week = weekKeys(now);
  const todayKey = dayKey(now);

  const days = week.map((key, index) => {
    const checks = checksOf(save, key);
    return {
      key,
      weekday: WEEKDAY_LABELS[index],
      done: habits.filter((habit) => habit.id in checks).length,
      total: habits.length,
      hasRecord: hasRecordOn(save, key),
      qualified: isQualifiedDay(save, key),
      today: key === todayKey,
    };
  });

  const trends = {};
  for (const category of TREND_CATEGORIES) {
    trends[category] = week.map((key) => percentOf(habits, checksOf(save, key), category));
  }

  const chars = save.learningProgress?.literacy?.chars;
  const charList = typeof chars === 'object' && chars !== null ? Object.values(chars) : [];
  const poems = save.learningProgress?.guoxue?.poems;
  const dayKeys = typeof save.days === 'object' && save.days !== null ? Object.keys(save.days) : [];

  const todayRow = days.find((row) => row.today) ?? days[0];
  const goal = count(save.parent?.dailyGoal);

  return {
    // goal 与 total 是**两个数**：线上把它们并排显示却不说它们不是同一件事的两端
    // （缺陷 12）。页面写「完成 5 项 · 目标 6 项（共 18 项）」，括号里那个数
    // 说明「目标」不是「全部」。
    today: {
      key: todayRow.key,
      done: todayRow.done,
      goal,
      met: todayRow.done >= goal,
      total: habits.length,
    },
    week: {
      days,
      // 复用 isQualifiedDay，**不新造第四个「本周」口径**（线上三套同叫本周，缺陷 11）。
      // 代价是这个数比线上小 —— 一个诚实的小数字比一个好看的大数字有用。
      qualifiedDays: days.filter((row) => row.qualified).length,
      minDays: WEEKLY_BONUS.minDays,
      bonusDone: save.lastWeeklyBonusWeek === week[0],
    },
    trends,
    totals: {
      // 识字给两个数：本仓库的掌握要熬完六个间隔跨 58 天，头两个月只显示
      // 「已掌握 0 字」会让家长以为识字没在动（ACHV-05 当初也是为这件事改的）
      charsLearned: charList.length,
      charsMastered: charList.filter((item) => count(item?.step) >= MASTERED_STEP).length,
      poems: typeof poems === 'object' && poems !== null ? Object.keys(poems).length : 0,
      stage: count(save.learningProgress?.math?.stage),
      readMinutes: readMinutesOf(save),
      days: dayKeys.length,
    },
  };
}

/**
 * 每日报告的读取入口：两张列表、叙述句、当天收支与宠物快照。
 *
 * **三个数一个来源**：`doneList` / `todoList` 构成划分，`done` 就是前者的长度。
 * 线上「已完成」不过滤 `enabled` 而「未完成」过滤（缺陷 14），顶上那个「完成 N 项」
 * 又是第三次数 —— 两张表加起来既可能多于也可能少于任务总数。
 *
 * `days` 里没有这个键时等同「空的一天」，**不抛错**：页面禁止点没有记录的格子，
 * 而读函数只对**非法**入参抛错（AGENTS.md 第 5 节第 6 条）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键
 * @returns {object} 页面直接绑的数据
 */
export function dailyReport(save, key) {
  const habits = enabledHabits(save);
  const checks = checksOf(save, key);

  // 停用的任务今天打过卡，两张列表都不含它，done 也不含它 —— 与 boardState
  // 的 today.done 同一个口径（PARENT-55 / PARENT-65 各钉一处）。
  // 那条打卡记录仍在存档里，家长把任务开回来它就回来了（软删除的同一条）。
  const doneList = habits.filter((habit) => habit.id in checks);
  const todoList = habits.filter((habit) => !(habit.id in checks));
  const done = doneList.length;
  const goal = count(save.parent?.dailyGoal);

  const learning = save.days?.[key]?.learning;

  return {
    key,
    done,
    goal,
    met: done >= goal,
    doneList,
    // 不截断 —— 线上 .slice(0, 8) 且不提示（.scratch/index-VUOSJfWA.js:697375），
    // 本仓库任务总数 18 条、页面能滚
    todoList,
    learning: typeof learning === 'object' && learning !== null ? learning : {},
    sentences: sentencesOf(doneList, learning),
    // 走 dayEarned，不重算 —— 「今天挣了多少」全仓只有一个算法
    currency: dayEarned(save, key),
    pet: { petLevel: count(save.pet?.petLevel), mood: count(save.pet?.mood) },
  };
}

/**
 * 叙述句：三条规则全从数据来，**一个任务 id 都不写死**。
 *
 * 线上那句 `completedTasks['brush-am'] && push('今天完成了早晚刷牙。')`（缺陷 15）
 * 只看早上那条就说「早晚」都刷了 —— 本仓库 `brush-am`（早上刷牙）与 `brush-pm`
 * （晚上刷牙）是两条独立任务，照抄会在报告里说一件没发生的事。
 *
 * **不做线上那句「建议明天继续复习昨天学习的汉字」**：它的触发条件与上一句完全相同
 * （`newChars.length` 判了两次），是一句读了同一份数据却装作有建议的模板。
 *
 * 句子在 utils 里拼而不在页面里，与 `coreWarn` / `statusText` 同一条：
 * **页面不选文案里的事实**，它只负责换行。
 *
 * @param {object[]} doneList 当天完成的任务
 * @param {unknown} learning 当天的学习记录
 * @returns {string[]} 一到两句
 */
function sentencesOf(doneList, learning) {
  const sentences = [];

  if (doneList.length > 0) {
    const names = doneList.map((habit) => habit.name).join('、');
    sentences.push(`今天完成了 ${doneList.length} 项：${names}。`);
  }

  const newChars = learning?.literacy?.newChars;
  if (Array.isArray(newChars) && newChars.length > 0) {
    const quoted = newChars.filter((char) => typeof char === 'string').map((char) => `「${char}」`);
    if (quoted.length > 0) sentences.push(`识字学了${quoted.join('')}。`);
  }

  if (sentences.length === 0) {
    sentences.push('今天还没有完成记录，明天一起加油！');
  }

  return sentences;
}
