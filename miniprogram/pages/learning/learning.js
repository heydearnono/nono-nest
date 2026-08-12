/**
 * 学习入口页：五个子模块的列表。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：这里只做取数、setData、事件转发。
 * 「这一格做没做」「这一格能不能点」都由 utils/learning.js 的 listLearning 给出，
 * 页面不判断 `page` 是不是空串，也不自己数完成数。
 */
import { dayKey } from '../../utils/dayKey.js';
import { listLearning } from '../../utils/learning.js';

Page({
  data: {
    /** 五格，每项是 { module, name, icon, desc, page, ready, done } */
    items: [],
    done: 0,
    total: 0,
  },

  onShow() {
    // 用 onShow 而非 onLoad：这是 tab 页（不会重新 onLoad），
    // 而且从阅读页 navigateBack 回来时那一格的「已完成」要跟着变
    const save = getApp().readSave();
    this.setData(listLearning(save, dayKey(Date.now())));
  },

  /**
   * 点一格：做好的跳过去，没做的给一句提示。
   *
   * @param {object} event 小程序事件对象，`dataset.index` 是格子下标
   */
  onTapModule(event) {
    const item = this.data.items[event.currentTarget.dataset.index];

    if (!item.ready) {
      wx.showToast({ title: `${item.name}还在做，等一等 🛠`, icon: 'none', duration: 1500 });
      return;
    }

    wx.navigateTo({ url: `/${item.page}` });
  },
});
