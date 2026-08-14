/**
 * 国学页：顶部两个分母 + 本周三首 + 到期复习 + 每张卡两个按钮。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：本周三首怎么选、哪首今天到期、表完态够不够打卡，
 * 全在 utils/poem.js。这里只做取数、转发表态、落盘、弹一句提示。
 *
 * **与识字页不同，这里一屏列多张卡**：本周三首是这一周的计划，孩子要看得见
 * 「还剩哪几首」；识字是队列，一次只该看一张。
 */
import { dayKey } from '../../utils/dayKey.js';
import { poemState, studyPoem } from '../../utils/poem.js';

Page({
  data: {
    /** poemState 的输出，见 utils/poem.js */
    state: null,
    /** 两个 tier 的会背数之和，只为顶部那句文案 —— 与识字页的 allDone 同一类聚合 */
    mastered: 0,
    /** 本周三首与到期复习都空了：这周的诗都学过啦 */
    allDone: false,
  },

  save: null,

  onLoad() {
    // 用 onLoad 而非 onShow：navigateTo 进来的页面只 onLoad 一次（与识字页一致）
    this.save = getApp().readSave();
    this.render();
  },

  /** 重算状态。表态后与 onLoad 都走这里，只有一处取数逻辑 */
  render() {
    const now = Date.now();
    const state = poemState(this.save, dayKey(now), now);

    this.setData({
      state,
      mastered: state.required.mastered + state.extended.mastered,
      allDone: state.weekly.length === 0 && state.reviews.length === 0,
    });
  },

  /**
   * 对一首诗表态：`data-recited` 为 `'1'` 是「已会背」，否则是「还没背下来」。
   *
   * @param {object} event 小程序事件对象，`dataset.id` 是诗 id
   */
  onStudy(event) {
    const { id, recited } = event.currentTarget.dataset;
    const now = Date.now();
    const wasDone = this.data.state.done;
    const next = studyPoem(this.save, dayKey(now), id, recited === '1', now);

    // 当天重复表态原样返回（POEM-16）：不落盘，只说一句
    if (next === this.save) {
      wx.showToast({ title: '今天已经学过这首啦 😊', icon: 'none', duration: 1200 });
      return;
    }

    this.save = getApp().writeSave(next);
    this.render();

    // 今天的第一次表态顺带打了卡：报打卡，不报单首（一次只弹一句）
    const title =
      this.data.state.done && !wasDone
        ? '国学打卡完成 +2⭐ +8经验'
        : recited === '1'
          ? '背下来啦，真棒 ✨'
          : '没关系，明天再见 😊';
    wx.showToast({ title, icon: 'none', duration: 1200 });
  },
});
