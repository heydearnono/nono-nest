/**
 * 贴纸乐园：页头进度 + 两个抽取按钮 + 七个类别 chip + 140 格图鉴 + 揭示层。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：拥有没有、几张、类别与稀有度的中文、
 * 免费抽用过没有、勋章够不够，全在 utils/sticker.js 的 `stickerState` 里算好。
 * 这里只做取数、setData、转发点击、按 `reason` 选提示语。
 *
 * `category` 与 `reveal` 都是**页面字段、不落盘**：筛选是「此刻在看哪一段」，
 * 揭示层是「刚刚抽到了什么」，两者关掉小程序就该消失
 * （与 `parent.js` 的 `unlocked`、`board.js` 的 `tab` 同一条）。
 * 线上把 `stickerReveal` / `stickerDropTick` 放进了 state，但那两个键也不在它的
 * 持久化白名单里 —— 本仓库直接落在页面上。
 *
 * 用 `onLoad` 而非 `onShow`：navigateTo 进来的页面只 onLoad 一次（与识字页一致）。
 * 抽取是本页面自己的写入，不需要 onShow 重算别处的改动。
 */
import { dayKey } from '../../utils/dayKey.js';
import { drawSticker, stickerState } from '../../utils/sticker.js';

/** 抽不动的两个原因码各对应一句话。**原因码不是文案**，映射在这一层 */
const REASON_TEXT = {
  freeUsed: '今天的免费抽用过啦，明天再来',
  noMedal: '勋章不够，先去打卡赚一枚',
};

/**
 * 按类别筛出要显示的格子。**筛选不在 WXML 里做**：`wx:if` 会给不显示的那些
 * 留下空占位，五列网格立刻塌。
 *
 * @param {object[]} items `stickerState` 的 140 条
 * @param {string} category 类别 key（`all` 或六类之一）
 * @returns {object[]} 当前这一段
 */
function filtered(items, category) {
  return category === 'all' ? items : items.filter((item) => item.category === category);
}

Page({
  data: {
    /** stickerState 的输出，见 utils/sticker.js */
    state: null,
    /** 当前筛选的类别 key（`all` 或六类之一），页面字段、不落盘 */
    category: 'all',
    /** 当前这一段要显示的格子，`category` 与 `state` 变时重算 */
    shown: [],
    /** 刚抽到的那张：`{ sticker, isNew }`，`null` 表示没有揭示层。页面字段、不落盘 */
    reveal: null,
  },

  save: null,

  onLoad() {
    this.save = getApp().readSave();
    this.render();
  },

  /** 重算状态。抽取后与 onLoad 都走这里，只有一处取数逻辑 */
  render() {
    const state = stickerState(this.save, dayKey(Date.now()));
    this.setData({ state, shown: filtered(state.items, this.data.category) });
  },

  /**
   * 切类别。只动页面字段与 `shown`，不重算 `stickerState`（数据没变）。
   *
   * @param {object} event 小程序事件对象，`dataset.key` 是类别 key
   */
  onTapCategory(event) {
    const { key } = event.currentTarget.dataset;
    this.setData({ category: key, shown: filtered(this.data.state.items, key) });
  },

  /**
   * 抽一张。两个按钮都**不 disabled**，抽不动时照 `reason` 给「为什么不能」
   * —— 线上把按钮禁用掉，于是那两句提示成了死代码（doc.md「线上的贴纸」缺陷 5）。
   *
   * @param {object} event 小程序事件对象，`dataset.source` 是 `'free'` 或 `'medal'`
   */
  onTapDraw(event) {
    const { source } = event.currentTarget.dataset;
    const now = Date.now();
    const out = drawSticker(this.save, dayKey(now), source, now);

    // 对象同一性：抽不动就不落盘（`STICKER-09` / `STICKER-12`）
    if (out.save === this.save) {
      wx.showToast({ title: REASON_TEXT[out.reason], icon: 'none', duration: 1500 });
      return;
    }

    this.save = getApp().writeSave(out.save);
    this.setData({ reveal: { sticker: out.sticker, isNew: out.isNew } });
    this.render();
  },

  /** 关掉揭示层。点哪儿都能关 —— 5 岁的孩子不找小叉号 */
  onCloseReveal() {
    this.setData({ reveal: null });
  },
});
