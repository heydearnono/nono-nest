/**
 * 识字页：两个 tab（新字 / 复习）、一张卡片、两个按钮。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：队列怎么排、卡片上的 emoji 怎么来、
 * 评完够不够打卡，全在 utils/literacy.js。这里只做取数、切 tab、转发评分、落盘。
 *
 * **一次只显示一张卡**：评过的字当天不再进任何队列（`LITERACY-13` / `14`），
 * 所以评完重算一次状态，下一张自然顶上来 —— 页面不维护「翻到第几张」的下标。
 */
import { dayKey } from '../../utils/dayKey.js';
import { gradeChar, literacyState } from '../../utils/literacy.js';

Page({
  data: {
    /** literacyState 的输出，见 utils/literacy.js */
    state: null,
    /** 当前 tab：`'new'` 新字 / `'review'` 复习 */
    tab: 'new',
    /** 当前这张卡（当前 tab 的队首），队列空时是 `null` */
    card: null,
    /** 两个队列都空了：今天的字都认完了 */
    allDone: false,
  },

  save: null,

  onLoad() {
    // 用 onLoad 而非 onShow：navigateTo 进来的页面只 onLoad 一次
    // （与阅读 / 英语两个表单页一致）。评分后自己 setData，不靠重进页面刷新
    this.save = getApp().readSave();
    this.render();
  },

  /** 重算状态并把队首那张卡挑出来。评分后与 onLoad 都走这里，只有一处取数逻辑 */
  render() {
    const state = literacyState(this.save, dayKey(Date.now()), Date.now());
    const queue = this.data.tab === 'new' ? state.newChars : state.reviewChars;

    this.setData({
      state,
      card: queue[0] ?? null,
      allDone: state.newChars.length === 0 && state.reviewChars.length === 0,
    });
  },

  /**
   * 切 tab。切完重挑卡片，走的还是 render 那一条。
   *
   * @param {object} event 小程序事件对象，`dataset.tab` 是目标 tab
   */
  onSwitchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab }, () => this.render());
  },

  /**
   * 评一个字：`data-known` 为 `'1'` 是「我认识」，否则是「还不太会」。
   *
   * @param {object} event 小程序事件对象
   */
  onGrade(event) {
    const card = this.data.card;
    if (card === null) return;

    const known = event.currentTarget.dataset.known === '1';
    const now = Date.now();
    const wasDone = this.data.state.done;
    const next = gradeChar(this.save, dayKey(now), card.char, known, now);

    // 当天重复评分会原样返回（LITERACY-13）；「什么都没发生就不落盘」是全仓一致的写法
    if (next === this.save) return;

    this.save = getApp().writeSave(next);
    this.render();

    // 刚好凑够今天的两个新字：报打卡，不报单字（一次只弹一句）
    const title =
      this.data.state.done && !wasDone
        ? '识字打卡完成 +2⭐ +8经验'
        : known
          ? `认识「${card.char}」啦 ✅`
          : `「${card.char}」明天再见 🔄`;
    wx.showToast({ title, icon: 'none', duration: 1200 });
  },
});
