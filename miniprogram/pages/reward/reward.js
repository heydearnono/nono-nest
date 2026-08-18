/**
 * 奖励中心：勋章与宝石、三张兑换卡、兑换记录、十一行成就。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：买得起买不起、进度几分之几、状态叫什么，
 * 全在 utils/reward.js 的两个 `*State` 里算好。这里只做取数、setData、转发点击。
 *
 * `onShow` 会调一次 `settleDay`：打卡路径已经在 `checkAwardAndGrow` 里结算过了
 * （`REWARD-13`），这里补的是**没有打卡也该发**的那两种情况 —— 刚导入线上存档、
 * 或者跨天后本周才凑够五个达标日。无事发生时 `settleDay` 原样返回入参，
 * `commit` 靠对象同一性不落盘，所以每次进页面都调是安全的。
 */
import { dayKey } from '../../utils/dayKey.js';
import { achievementState, redeem, rewardState, settleDay } from '../../utils/reward.js';

Page({
  data: {
    /** rewardState 的输出，见 utils/reward.js */
    state: null,
    /** achievementState 的十一行 */
    achievements: [],
  },

  /** 内存里的当前存档。不放进 data —— 存档比页面要渲染的东西大得多 */
  save: null,

  onShow() {
    // 用 onShow 而非 onLoad：兑换后返回、跨天回到前台都要重算
    const now = Date.now();
    const today = dayKey(now);
    const stored = getApp().readSave();
    const settled = settleDay(stored, today, now);

    // 对象同一性：结算什么都没发生就不落盘，空写会白盖一次 updatedAt
    this.save = settled === stored ? stored : getApp().writeSave(settled);
    this.render(now);

    if (settled !== stored) this.toastSettled(stored, settled, today);
  },

  /**
   * 把当前存档投影成页面 data。
   *
   * @param {number} [now] 毫秒时间戳
   */
  render(now = Date.now()) {
    const today = dayKey(now);

    this.setData({
      state: rewardState(this.save, today, now),
      achievements: achievementState(this.save, today, now),
    });
  },

  /**
   * 结算真的发生了什么时报一句。**一次只弹最要紧的一条**（勋章 > 周奖励 > 成就）：
   * 三条一起弹会互相盖掉，而 5 岁孩子只需要知道「我拿到了东西」。
   *
   * 弹哪一条由**两份存档的水位差**决定，不重新判一遍规则 —— 直接读
   * `state.allDone` 会把「今天早些时候在首页发过的全勤」也算成本次新发的。
   *
   * @param {object} before 结算前的存档
   * @param {object} after 结算后的存档
   * @param {string} today 日期键
   */
  toastSettled(before, after, today) {
    const gotAllDone =
      after.days?.[today]?.bonuses?.allDone === true &&
      before.days?.[today]?.bonuses?.allDone !== true;
    const gotWeekly = after.lastWeeklyBonusWeek !== before.lastWeeklyBonusWeek;

    const title = gotAllDone
      ? '今日全勤达成！+1🏅'
      : gotWeekly
        ? '本周达标啦！+5⭐ +1💎'
        : '解锁新成就！+1🏅';

    wx.showToast({ title, icon: 'none', duration: 1500 });
  },

  /**
   * 申请兑换。勋章不够时 `redeem` 原样返回（不抛错），此时只提示，不落盘。
   *
   * @param {object} event 小程序事件对象，`dataset.id` 是奖励项 id
   */
  onTapRedeem(event) {
    const { id } = event.currentTarget.dataset;
    const now = Date.now();
    const next = redeem(this.save, dayKey(now), id, now);

    if (next === this.save) {
      wx.showToast({ title: '勋章还不够，再攒一攒 🏅', icon: 'none', duration: 1500 });
      return;
    }

    this.save = getApp().writeSave(next);
    this.render(now);
    // 「待家长兑现」是记录里的状态，提示语也说同一件事：孩子知道下一步要找爸爸妈妈
    wx.showToast({ title: '换好啦，去找爸爸妈妈 🎁', icon: 'none', duration: 1500 });
  },

  /** 进贴纸乐园。navigateTo 而非 switchTab：它不是 tab 页（app.json 仍是四格） */
  onTapSticker() {
    wx.navigateTo({ url: '/pages/sticker/sticker' });
  },
});
