/**
 * 宠物页：看小伙伴、喂食、陪玩、换形象。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：这里只做取数、setData、事件转发。
 * 阈值判断全在 utils/pet.js 的 petState 里 —— 页面只认 feedBlock / playBlock
 * 这两个原因码，按它选提示语。文案在页面，规则不在。
 */
import { choosePet, feed, petState, play, settleFullness } from '../../utils/pet.js';

/** 喂不了 / 玩不了时的提示语。原因码 → 文案，页面不判断为什么 */
const FEED_TIPS = {
  full: '已经饱啦，等会儿再吃 🍖',
  noFood: '宠物粮不够啦，先去打卡吧',
};

const PLAY_TIPS = {
  happy: '已经超级开心啦，再玩一会～ 💕',
};

Page({
  data: {
    pet: null,
    /** 五颗心的坐标，WXML 里没有 Array.from，画 0-5 的刻度要一个现成的数组 */
    scale: [1, 2, 3, 4, 5],
    /** 点一下宠物的即时反馈，靠 class 切换，不做粒子特效（见 doc.md 范围外） */
    bouncing: false,
  },

  save: null,

  onShow() {
    // 用 onShow 而非 onLoad：从首页 tab 切回来时饱腹度可能已经掉了一格，
    // 而且 tab 页不会重新 onLoad
    const now = Date.now();
    // 结算要落盘：饱腹度的衰减是有基准时刻的状态变化，只算不存的话
    // lastFedAt 永远不前进，下次进来会重复衰减同一段时间
    this.save = getApp().writeSave(settleFullness(getApp().readSave(), now));
    this.render(now);
  },

  render(now = Date.now()) {
    this.setData({ pet: petState(this.save, now) });
  },

  /**
   * 落盘并重渲染。`next === this.save` 说明纯函数判定这次什么都不该发生，
   * 此时不写 storage —— 空写会白盖一次 updatedAt。
   *
   * @param {object} next 纯函数返回的存档
   * @returns {boolean} 是否真的发生了变化
   */
  commit(next) {
    if (next === this.save) return false;

    this.save = getApp().writeSave(next);
    this.render();
    return true;
  },

  onTapFeed() {
    const { feedBlock } = this.data.pet;
    if (feedBlock) {
      wx.showToast({ title: FEED_TIPS[feedBlock], icon: 'none', duration: 1500 });
      return;
    }

    this.commit(feed(this.save, Date.now()));
    wx.showToast({ title: `${this.data.pet.name}吃饱啦 🍖`, icon: 'none', duration: 1200 });
  },

  onTapPlay() {
    const { playBlock } = this.data.pet;
    if (playBlock) {
      wx.showToast({ title: PLAY_TIPS[playBlock], icon: 'none', duration: 1500 });
      return;
    }

    this.commit(play(this.save, Date.now()));
    wx.showToast({ title: '玩得好开心！+5 经验 💕', icon: 'none', duration: 1200 });
  },

  onTapType(event) {
    const { type } = event.currentTarget.dataset;
    if (type === this.data.pet.type) return;

    this.commit(choosePet(this.save, type));
    wx.showToast({ title: `换成${this.data.pet.name}啦`, icon: 'none', duration: 1200 });
  },

  onTapPet() {
    // 摸一下没有任何数值变化，只有一下弹跳 —— 陪玩才涨开心度
    this.setData({ bouncing: true });
    setTimeout(() => this.setData({ bouncing: false }), 400);
  },
});
