/**
 * 英语打卡页：斑马英语上完课回来记一笔。
 *
 * 与阅读页同一套结构（`learningLog` → `data.form` → `learningBlock` → `completeLearning`），
 * 差别只在字段。**英语没有必填字段**（`ENG-06`），所以这里的原因码只可能是 `'done'` ——
 * 校验规则仍在 `utils`，页面不因为「反正只有一种」就省掉这次询问。
 *
 * `words` / `sentences` 在输入框里是字符串、在存档里是数组，切分与回填都由
 * `utils/learning.js` 做，页面不 `split` 也不 `join`。
 */
import { dayKey } from '../../utils/dayKey.js';
import { ENG_OPTIONS, completeLearning, learningBlock, learningLog } from '../../utils/learning.js';

/** 这一页对应的学习子模块 */
const MODULE = 'english';

/** 提交不了时的提示语。原因码 → 文案，页面不判断为什么 */
const TIPS = {
  done: '今天已经打过英语卡啦 🅰️',
};

Page({
  data: {
    /** 表单形状，见 utils/learning.js 的 FORMS.english */
    form: null,
    /** 跟读次数的上限，取自 utils —— 页面不自己写 10 */
    aloudMax: ENG_OPTIONS.readAloudMax,
    done: false,
  },

  save: null,

  onLoad() {
    // 用 onLoad 而非 onShow：非 tab 页，放 onShow 会把填了一半的表单重置回存档内容
    const key = dayKey(Date.now());
    this.save = getApp().readSave();
    this.setData({
      form: learningLog(this.save, key, MODULE),
      done: learningBlock(this.save, key, MODULE, {}) === 'done',
    });
  },

  /**
   * 输入框写回：`data-field` 说明改哪个字段。
   *
   * @param {object} event 小程序事件对象
   */
  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  /**
   * 跟读次数的加减。不用 slider：5 岁的孩子自己按 ＋ 更直观。
   * 上下限就地夹住，让按钮到了边界不再动 —— 收敛的权威仍是 `toRecord`（`ENG-04`），
   * 这里夹的是同一个 `ENG_OPTIONS`，不是第二份规则。
   *
   * @param {object} event 小程序事件对象，`dataset.delta` 是 `1` 或 `-1`
   */
  onStepAloud(event) {
    const delta = Number(event.currentTarget.dataset.delta);
    const current = Number(this.data.form.readAloudCount);
    const next = Math.min(
      ENG_OPTIONS.readAloudMax,
      Math.max(ENG_OPTIONS.readAloudMin, current + delta),
    );
    this.setData({ 'form.readAloudCount': next });
  },

  onSubmit() {
    const now = Date.now();
    const key = dayKey(now);
    const block = learningBlock(this.save, key, MODULE, this.data.form);
    if (block) {
      wx.showToast({ title: TIPS[block], icon: 'none', duration: 1500 });
      return;
    }

    const next = completeLearning(this.save, key, MODULE, this.data.form, now);
    if (next === this.save) return;

    this.save = getApp().writeSave(next);
    this.setData({ done: true });
    wx.showToast({ title: '英语打卡完成 +2⭐ +8经验', icon: 'none', duration: 1500 });
    setTimeout(() => wx.navigateBack(), 900);
  },
});
