/**
 * 家长看板：PIN 蒙层 + 看板段 + 报告段。
 *
 * **拆出这一页的判据是只读性，不是行数**（doc.md「拆一个只读的看板」）：
 * 看板与报告一个字都不写盘，所以「从家长首页跳过来、进去前再验一次 PIN」不别扭
 * （一天看一次，多输四个数字可以接受）。任务段不行 —— 改完要立刻看到结果，
 * 中间插一次验证会让「改错了再改回来」变成噩梦。所以**审批留在 `parent` 的任务段**，
 * 本页零写按钮。
 *
 * 「只读」说的是看板段与报告段。**蒙层那一层仍然落盘** —— `pinFails` 是水位，
 * 验错要累加、验对要清零（`PARENT-04` / `PARENT-03`），与 `parent.js` 同一条。
 *
 * 蒙层的这 20 行与 `parent.js` 的**同形但不共用**：共用要抽一个 `behavior`
 * 或一个渲染 helper，而两处的差别（验过之后显示什么）恰好是全部内容。
 * 这笔重复记在 doc.md 里，第三处出现时再抽。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：今日四个数、七格日历、三条趋势、四格累计、
 * 两张列表与叙述句全在 utils/parentReport.js 里算好。这里只做取数、切段、翻天，
 * 外加把三条趋势拼成一个可 `wx:for` 的数组（那是排版，不是算数）。
 */
import { boardState, dailyReport } from '../../utils/parentReport.js';
import { parentState, verifyPin } from '../../utils/parent.js';
import { dayKey } from '../../utils/dayKey.js';
import { LEARNING_MODULES } from '../../data/learningModules.js';

/** 冷却倒计时的刷新间隔。与 parent.js 同一个数 —— 蒙层是同形的两份 */
const TICK_MS = 1000;

/** 三条趋势柱的标题。顺序即 `trends` 的键序（与 defaultHabits.js 的分段一致） */
const TREND_LABELS = [
  { key: 'habit', label: '自律' },
  { key: 'learning', label: '学习' },
  { key: 'health', label: '健康' },
];

Page({
  data: {
    /** 验过 PIN 了没有。**页面字段，不落盘**（与 parent.js 同一条） */
    unlocked: false,
    /** 两段之一：`'board'` / `'report'` */
    tab: 'board',
    /** parentState 的输出，蒙层用它的 locked / lockedSeconds / failsLeft */
    state: null,
    /** boardState 的输出（today / week / trends / totals） */
    board: null,
    /** dailyReport 的输出，看的是 reportKey 那一天 */
    report: null,
    /** 报告段在看哪一天。默认今天，翻天只在 week.days 那七个键里翻 */
    reportKey: '',
    /** 三条趋势拼成的可 wx:for 数组：`[{ key, label, values }]` */
    charts: [],
    /** 当天有记录的学习子键，拼成 `[{ name, icon, minutes }]` */
    learningRows: [],
    /** 蒙层输入框里的四位数字 */
    input: '',
    /** 蒙层下面那句话：错了几次 / 冷却中还剩几秒 */
    hint: '',
  },

  /** 内存里的当前存档。不放进 data —— 存档比页面要渲染的东西大得多 */
  save: null,

  /** 冷却倒计时的 interval id */
  ticker: 0,

  onLoad() {
    // 用 onLoad 而非 onShow：navigateTo 进来的页面只 onLoad 一次，
    // 而本页只读 —— 没有「操作完要重算」这件事
    this.save = getApp().readSave();
    this.setData({ reportKey: dayKey(Date.now()) });
    this.render();
  },

  onUnload() {
    this.stopTicker();
  },

  onHide() {
    this.stopTicker();
  },

  /** 重算。onLoad、验 PIN、切段、翻天都走这里，只有一处取数逻辑 */
  render() {
    const now = Date.now();
    const state = parentState(this.save, now);
    const board = boardState(this.save, now);
    // 翻天之前那个键可能不在本周（跨天回到前台）—— 落回今天，让七格里有一格亮着
    const reportKey = board.week.days.some((row) => row.key === this.data.reportKey)
      ? this.data.reportKey
      : board.today.key;
    const report = dailyReport(this.save, reportKey);

    this.setData({
      state,
      board,
      reportKey,
      report,
      charts: TREND_LABELS.map((item) => ({ ...item, values: board.trends[item.key] })),
      learningRows: learningRowsOf(report.learning),
      hint: state.locked ? `密码错太多次了，${state.lockedSeconds} 秒后再试` : '',
    });

    if (state.locked) this.startTicker();
    else this.stopTicker();
  },

  /** 冷却中每秒重算一次剩余秒数。`lockedSeconds` 由 utils 现算，页面不自己减 */
  startTicker() {
    if (this.ticker !== 0) return;
    this.ticker = setInterval(() => {
      const state = parentState(this.save, Date.now());
      if (!state.locked) {
        this.stopTicker();
        this.setData({ state, hint: '' });
        return;
      }
      this.setData({ state, hint: `密码错太多次了，${state.lockedSeconds} 秒后再试` });
    }, TICK_MS);
  },

  stopTicker() {
    if (this.ticker === 0) return;
    clearInterval(this.ticker);
    this.ticker = 0;
  },

  /**
   * 蒙层输入：只留数字、最多四位。
   *
   * @param {object} event 小程序事件对象
   */
  onInputPin(event) {
    this.setData({ input: event.detail.value.replace(/\D/g, '').slice(0, 4) });
  },

  /** 点「进去」：验一次 PIN。三种结果对应 verifyPin 的三个 reason */
  onTapUnlock() {
    const result = verifyPin(this.save, this.data.input, Date.now());

    if (result.ok) {
      // 落盘是为了清零 pinFails（验对即清零），不是为了记「验过了」
      this.save = getApp().writeSave(result.save);
      this.setData({ unlocked: true, input: '', hint: '' });
      this.render();
      return;
    }

    // 冷却中原样返回入参（PARENT-06）：不落盘，只把倒计时显出来
    if (result.reason === 'locked') {
      this.setData({ input: '' });
      this.render();
      return;
    }

    this.save = getApp().writeSave(result.save);
    const state = parentState(this.save, Date.now());
    this.setData({
      input: '',
      hint: state.locked
        ? `密码错太多次了，${state.lockedSeconds} 秒后再试`
        : `密码不对哦，还能试 ${state.failsLeft} 次`,
    });
    this.render();
  },

  /**
   * 两段切换。
   *
   * @param {object} event 小程序事件对象
   */
  onTapTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
  },

  /**
   * 点日历里的一格：看那天的报告。**没有记录的那几格点不动**，
   * 因为一份空报告说不出任何事 —— 那种格子显示「—」而不是 `0/18`（缺陷 13）。
   *
   * 「能不能点」查的是 `week.days` 那一行本身，而不是 `dataset` 里带过来的布尔：
   * dataset 的值经过一次模板序列化，判 `=== true` 与判真值在那里是两件事。
   * 行就在 `this.data` 里，直接查它没有第二个真相。
   *
   * 选日期用的就是这七个键，**不开 `picker`**：`wx.datePicker` 能选到没有记录的
   * 任意一天，而看板已经把这一周摊开了。
   *
   * @param {object} event 小程序事件对象，`dataset.key` 是那天的日期键
   */
  onTapDay(event) {
    const { key } = event.currentTarget.dataset;
    const row = this.data.board.week.days.find((item) => item.key === key);
    if (!row || !row.hasRecord) return;

    this.setData({ reportKey: key, tab: 'report' });
    this.render();
  },
});

/**
 * 当天有记录的学习子键 → 可 `wx:for` 的行。
 *
 * `dailyReport().learning` 是**当天那份原始记录**（`parentReport.js` 不解释它，
 * 也不 import 任何 `data/`）—— 五个子键的形状分别归五个 feature 模块。
 * 这里只做两件排版：把子键换成名字与图标（来自 `LEARNING_MODULES`，与
 * `math.js` 那个页面 import 常量表同一条），以及读出 `minutes` 这个标量。
 * **不在页面里数数组长度** —— 那是 utils 的事，本轮没有规格要那些数字。
 *
 * @param {object} learning 当天的 `learning` 子对象（可能是空对象）
 * @returns {object[]} `[{ module, name, icon, minutes }]`
 */
function learningRowsOf(learning) {
  return LEARNING_MODULES.filter((item) => learning[item.module] !== undefined).map((item) => ({
    module: item.module,
    name: item.name,
    icon: item.icon,
    // 只有阅读与英语有 minutes；没有就是 0，模板里判 `> 0` 才显示
    minutes: Number(learning[item.module]?.minutes) || 0,
  }));
}
