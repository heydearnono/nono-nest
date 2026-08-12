/**
 * 健康页：饮食 / 便便 / 洗澡 / 运动四张卡片。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：这里只做取数、setData、事件转发。
 * 三个 emoji、糖数上限、周目标的 3 都由 `healthState` 给出，页面不写这些数；
 * 「这一下要不要发星星」由 `toggleHealth` / `setHealth` 决定，页面只看货币差额出提示。
 */
import { dayKey } from '../../utils/dayKey.js';
import { healthState, setHealth, toggleHealth } from '../../utils/health.js';

Page({
  data: {
    /** 十一个字段的规范化当前值，见 utils/health.js 的 FIELDS */
    log: null,
    /** { done, target } 或 null（家长删掉洗澡任务时不显示计数） */
    bathWeek: null,
    /** [{ icon, current }]，页面不自己写那三个 emoji */
    poopIcons: [],
    sugarMax: 0,
  },

  save: null,

  onShow() {
    // 用 onShow 而非 onLoad：这是 tab 页，不会重新 onLoad
    this.save = getApp().readSave();
    this.render();
  },

  /** 把当前存档铺到 data 上。取数只有这一处 */
  render() {
    const now = Date.now();
    this.setData(healthState(this.save, dayKey(now), now));
  },

  /**
   * 落盘并重新渲染，顺带按货币差额出提示。
   *
   * 无事发生时纯函数返回入参本身，这里就直接退出 —— 与首页 / 宠物页同一条。
   *
   * @param {object} next 纯函数返回的新存档
   */
  commit(next) {
    if (next === this.save) return;

    const gained = next.currency.star - this.save.currency.star;
    this.save = getApp().writeSave(next);
    this.render();

    if (gained > 0) {
      wx.showToast({ title: `记下啦 +${gained}⭐ +5经验`, icon: 'none', duration: 1200 });
    } else if (gained < 0) {
      wx.showToast({ title: `取消了 ${gained}⭐`, icon: 'none', duration: 1200 });
    }
  },

  /**
   * 点一个开关。反转由 `toggleHealth` 自己算，页面不传 `!当前值`。
   *
   * @param {object} event 小程序事件对象，`dataset.field` 是字段名
   */
  onToggle(event) {
    const { field } = event.currentTarget.dataset;
    const now = Date.now();
    this.commit(toggleHealth(this.save, dayKey(now), field, now));
  },

  /**
   * 数字输入框写回（糖数 / 运动分钟数）。
   *
   * 每敲一下都调一次，靠 `setHealth` 的同一性挡住无变化的落盘（`HEALTH-15`）。
   *
   * @param {object} event 小程序事件对象，`dataset.field` 是字段名
   */
  onInput(event) {
    const { field } = event.currentTarget.dataset;
    const now = Date.now();
    this.commit(setHealth(this.save, dayKey(now), field, event.detail.value, now));
  },

  /**
   * 选一个便便心情。选了就等于记了一次便便（`HEALTH-11`），连带发放由 utils 做。
   *
   * @param {object} event 小程序事件对象，`dataset.icon` 是那个 emoji
   */
  onPickPoop(event) {
    const { icon } = event.currentTarget.dataset;
    const now = Date.now();
    this.commit(setHealth(this.save, dayKey(now), 'poopIcon', icon, now));
  },
});
