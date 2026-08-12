/**
 * 阅读打卡页：填一张表，点一下完成。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：表单初值来自 `learningLog`，能不能提交问
 * `learningBlock`，提交走 `completeLearning`。页面只做三件事 —— 把输入写进
 * `data.form`、按原因码选提示语、落盘。收敛规则（负数、空串、白名单）不在这里。
 */
import { dayKey } from '../../utils/dayKey.js';
import {
  READ_OPTIONS,
  completeLearning,
  learningBlock,
  learningLog,
} from '../../utils/learning.js';

/** 这一页对应的学习子模块 */
const MODULE = 'reading';

/** 提交不了时的提示语。原因码 → 文案，页面不判断为什么（与 pages/pet 同一套） */
const TIPS = {
  done: '今天已经打过阅读卡啦 📖',
  noTitle: '请先填写书名哦 📚',
};

Page({
  data: {
    /** 表单形状，见 utils/learning.js 的 FORMS.reading */
    form: null,
    /** 两行选择按钮的可选值，从 utils 拿，不抄第二遍 */
    modes: READ_OPTIONS.modes,
    moods: READ_OPTIONS.moods,
    /** 已经打过卡：按钮变灰，但仍可点（点了给提示，见 pet.wxml 那条注释） */
    done: false,
  },

  save: null,

  onLoad() {
    // 用 onLoad 而非 onShow：这不是 tab 页，navigateTo 进来只会 onLoad 一次。
    // 放在 onShow 会在从别处返回时把家长填了一半的表单重置回存档内容
    const key = dayKey(Date.now());
    this.save = getApp().readSave();
    this.setData({
      form: learningLog(this.save, key, MODULE),
      done: learningBlock(this.save, key, MODULE, {}) === 'done',
    });
  },

  /**
   * 输入框与选择行共用的写回：`data-field` 说明改哪个字段。
   *
   * @param {object} event 小程序事件对象
   */
  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  /**
   * 选一种阅读方式 / 一个心情。值在 `data-value` 上，与输入框走同一条写回。
   *
   * @param {object} event 小程序事件对象
   */
  onPick(event) {
    const { field, value } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: value });
  },

  onSubmit() {
    const now = Date.now();
    const key = dayKey(now);
    const block = learningBlock(this.save, key, MODULE, this.data.form);
    if (block) {
      wx.showToast({ title: TIPS[block], icon: 'none', duration: 1500 });
      return;
    }

    // 走到这里 completeLearning 必然返回新对象，仍按 next === this.save 判一次：
    // 「什么都没发生就不落盘」是全仓一致的写法，少一处例外少一处要记的事
    const next = completeLearning(this.save, key, MODULE, this.data.form, now);
    if (next === this.save) return;

    this.save = getApp().writeSave(next);
    this.setData({ done: true });
    wx.showToast({ title: '阅读打卡完成 +2⭐ +8经验', icon: 'none', duration: 1500 });
    // 停一下再退：Toast 在返回后仍显示，但入口页要等它退回去才 onShow 重读
    setTimeout(() => wx.navigateBack(), 900);
  },
});
