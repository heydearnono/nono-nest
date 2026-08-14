import { dayKey } from '../../utils/dayKey.js';
import { greetingFor } from '../../utils/greeting.js';
import { dayProgress, habitStreak, isChecked, listHabits } from '../../utils/habit.js';
import { checkAwardAndGrow } from '../../utils/pet.js';
import { uncheckAndRefund } from '../../utils/point.js';
import { settleDay } from '../../utils/reward.js';

/**
 * 首页。适配层：读存档、取当前时间、setData、写存档。
 * 任何阈值与公式都在 utils/ 里，这里不做业务判断（AGENTS.md 第 3 节）。
 */

/**
 * 长按问候语进家长端要按住多久。线上是 3 秒，本仓库缩到 1.5 秒 ——
 * 3 秒是为了「防孩子误触」，但真正防误触的是后面那道 PIN；
 * 5 岁的孩子按住一行不动的字 1.5 秒本来就不常发生（parent/doc.md）。
 */
const LONG_PRESS_MS = 1500;

Page({
  data: {
    greeting: '',
    /** 打卡格子，每项是 { id, name, icon, checked } */
    items: [],
    done: 0,
    total: 0,
    streak: 0,
    /** 四种货币。P3-b 起勋章由全勤与成就产出、宝石由周奖励产出，四种都会动 */
    star: 0,
    petFood: 0,
    medal: 0,
    gem: 0,
  },

  /** 内存里的当前存档。不放进 data —— 存档比页面要渲染的东西大得多 */
  save: null,

  /** 长按问候语的计时器 id，0 表示没在计时 */
  pressTimer: 0,

  onShow() {
    // 用 onShow 而非 onLoad：跨零点后回到前台，日期键必须重算
    const now = Date.now();
    const stored = getApp().readSave();
    // 结算一次：跨天后本周才凑够五个达标日、或刚导入线上存档时，
    // 没有任何打卡也该发奖励。什么都没发生时 settleDay 原样返回，不落盘
    const settled = settleDay(stored, dayKey(now), now);

    this.save = settled === stored ? stored : getApp().writeSave(settled);
    this.render();
  },

  /**
   * 把当前存档投影成页面 data。
   */
  render() {
    const now = Date.now();
    const today = dayKey(now);

    this.setData({
      greeting: greetingFor(new Date(now).getHours()),
      items: listHabits(this.save).map((habit) => ({
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        checked: isChecked(this.save, today, habit.id),
      })),
      ...dayProgress(this.save, today),
      streak: habitStreak(this.save, now),
      star: this.save.currency.star,
      petFood: this.save.currency.petFood,
      medal: this.save.currency.medal,
      gem: this.save.currency.gem,
    });
  },

  /**
   * 点一下切换打卡状态：打卡走 PET 区的外层函数（发货币 + 涨经验与开心度 + 结算奖励），
   * 取消只走 POINT 区退货币 —— 撤回不收回经验、不降开心度、也不退勋章
   * （「温和，不惩罚」，见 docs/features/pet/doc.md）。
   *
   * @param {object} event 小程序事件对象，`dataset.id` 是任务 id
   */
  onTapHabit(event) {
    const { id } = event.currentTarget.dataset;
    const now = Date.now();
    const today = dayKey(now);
    const wasChecked = isChecked(this.save, today, id);
    const before = this.save;

    const next = wasChecked
      ? uncheckAndRefund(before, today, id, now)
      : checkAwardAndGrow(before, today, id, now);

    const gained = next.currency.star - before.currency.star;
    this.save = getApp().writeSave(next);
    this.render();

    wx.showToast({
      title: wasChecked ? '已取消打卡' : this.checkedTitle(before, next, today, gained),
      icon: 'none',
      duration: 1200,
    });
  },

  /**
   * 打卡成功后弹哪一句。**一次只弹最要紧的一条**：勋章 > 周奖励 > 成就 > 星光。
   * 打这一下可能同时触发全勤、周奖励与几条成就，四句一起弹会互相盖掉。
   *
   * 按**两份存档的水位差**判断，不重新算一遍规则 —— 直接读 `bonuses.allDone`
   * 会把今天早些时候就发过的那枚也算成本次新发的。
   *
   * @param {object} before 打卡前的存档
   * @param {object} after 打卡后的存档
   * @param {string} today 日期键
   * @param {number} gained 本次到手的星光
   * @returns {string} 提示语
   */
  checkedTitle(before, after, today, gained) {
    if (
      after.days?.[today]?.bonuses?.allDone === true &&
      before.days?.[today]?.bonuses?.allDone !== true
    ) {
      return '今日全勤达成！+1🏅';
    }
    if (after.lastWeeklyBonusWeek !== before.lastWeeklyBonusWeek) {
      return '本周达标啦！+5⭐ +1💎';
    }
    if (after.achievements.length > before.achievements.length) {
      return '解锁新成就！+1🏅';
    }

    return `太棒啦！+${gained}⭐`;
  },

  /** 点货币带进奖励中心。navigateTo 而非 switchTab：它不是 tab 页 */
  onTapReward() {
    wx.navigateTo({ url: '/pages/reward/reward' });
  },

  /**
   * 按住问候语：起一个 1.5 秒的 `setTimeout`（**不是轮询**）。
   * 线上用的是 100ms 的 `setInterval`，而清理只挂在一半的抬手路径上 ——
   * 指针事件被滚动接管时那个 interval 永远不清，效果是「三秒后蒙层自己弹出来」
   * （parent/doc.md 缺陷 1）。小程序里 touchend 与 touchcancel 都能绑，
   * 两个都清同一个 timer id。
   */
  onGreetTouchStart() {
    this.clearPressTimer();
    this.pressTimer = setTimeout(() => {
      this.pressTimer = 0;
      wx.navigateTo({ url: '/pages/parent/parent' });
    }, LONG_PRESS_MS);
  },

  /** 抬手或被打断：清掉计时器。touchend 与 touchcancel 共用这一个 */
  onGreetTouchEnd() {
    this.clearPressTimer();
  },

  onHide() {
    // 切后台时手上那一下不算长按 —— 否则回到前台会莫名跳进家长端
    this.clearPressTimer();
  },

  onUnload() {
    this.clearPressTimer();
  },

  clearPressTimer() {
    if (this.pressTimer === 0) return;
    clearTimeout(this.pressTimer);
    this.pressTimer = 0;
  },
});
