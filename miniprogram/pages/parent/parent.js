/**
 * 家长端：PIN 蒙层 + 家长首页（设置段 + 数据段）。
 *
 * **蒙层与家长首页是同一个页面的两个状态**（`unlocked` 是页面字段，不落盘）：
 * 分成两页就要在「验过了」这件事上落一个状态，而它不该跨页面存活 ——
 * 退出家长端再进来必须重新验。同页两状态时它只是页面实例的一个字段，
 * `onUnload` 自然消失（doc.md）。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：验 PIN、冷却剩余秒数、白名单与夹范围
 * 全在 utils/parent.js；导入映射在 utils/importOnline.js。这里只做取数、
 * 转发输入、落盘、弹提示，外加一个倒计时的 `setInterval`（那是渲染的事）。
 *
 * **本页是全仓第一个 `importOnlineSave` 调用点** —— 在此之前 15 条导入规格全绿
 * 而零调用点，nono 线上的进度搬不过来。
 */
import { exportJson, parentState, saveSettings, verifyPin } from '../../utils/parent.js';
import { importOnlineSave } from '../../utils/importOnline.js';
import { defaultSave } from '../../utils/save.js';

/** 冷却倒计时的刷新间隔。只在 `locked` 为真时开，解锁即清 */
const TICK_MS = 1000;

Page({
  data: {
    /** 验过 PIN 了没有。**页面字段，不落盘** */
    unlocked: false,
    /** parentState 的输出，见 utils/parent.js */
    state: null,
    /** 蒙层输入框里的四位数字 */
    input: '',
    /** 蒙层下面那句话：错了几次 / 冷却中还剩几秒 */
    hint: '',
    /** 设置段四个输入框的当前值（受控，保存时一次性交给 saveSettings） */
    form: { childName: '', pin: '', dailyGoal: '', note: '' },
    /** 导入粘贴框里的文本 */
    pasted: '',
    /** 导入解析出来的摘要，`null` 时确认按钮不出现 */
    preview: null,
  },

  /** 内存里的当前存档。不放进 data —— 存档比页面要渲染的东西大得多 */
  save: null,

  /** 待导入的那份存档，`preview` 的来源。确认覆盖时落盘的就是它 */
  pending: null,

  /** 冷却倒计时的 interval id */
  ticker: 0,

  onLoad() {
    // 用 onLoad 而非 onShow：navigateTo 进来的页面只 onLoad 一次
    this.save = getApp().readSave();
    this.render();
  },

  onUnload() {
    this.stopTicker();
  },

  onHide() {
    // 切后台时停掉倒计时：冷却是按 pinLockedUntil 算的，回来时 render 一次就对了
    this.stopTicker();
  },

  /** 重算状态。onLoad、验 PIN、保存设置、导入都走这里，只有一处取数逻辑 */
  render() {
    const state = parentState(this.save, Date.now());

    this.setData({
      state,
      hint: state.locked ? `密码错太多次了，${state.lockedSeconds} 秒后再试` : '',
      form: {
        childName: state.childName,
        pin: state.pin,
        dailyGoal: String(state.dailyGoal),
        note: state.note,
      },
    });

    if (state.locked) this.startTicker();
    else this.stopTicker();
  },

  /** 冷却中每秒重算一次剩余秒数。`lockedSeconds` 由 utils 现算，页面不自己减 */
  startTicker() {
    if (this.ticker !== 0) return;
    this.ticker = setInterval(() => {
      const state = parentState(this.save, Date.now());
      if (!state.locked) {
        this.stopTicker();
        this.setData({ state, hint: '' });
        return;
      }
      this.setData({ state, hint: `密码错太多次了，${state.lockedSeconds} 秒后再试` });
    }, TICK_MS);
  },

  stopTicker() {
    if (this.ticker === 0) return;
    clearInterval(this.ticker);
    this.ticker = 0;
  },

  /**
   * 蒙层输入：只留数字、最多四位（与线上同一条 `replace(/\D/g,'').slice(0,4)`）。
   *
   * @param {object} event 小程序事件对象
   */
  onInputPin(event) {
    this.setData({ input: event.detail.value.replace(/\D/g, '').slice(0, 4) });
  },

  /** 点「进去」：验一次 PIN。三种结果对应 verifyPin 的三个 reason */
  onTapUnlock() {
    const result = verifyPin(this.save, this.data.input, Date.now());

    if (result.ok) {
      // 落盘是为了清零 pinFails（验对即清零），不是为了记「验过了」
      this.save = getApp().writeSave(result.save);
      this.setData({ unlocked: true, input: '', hint: '' });
      this.render();
      return;
    }

    // 冷却中原样返回入参（PARENT-06）：不落盘，只把倒计时显出来
    if (result.reason === 'locked') {
      this.setData({ input: '' });
      this.render();
      return;
    }

    this.save = getApp().writeSave(result.save);
    const state = parentState(this.save, Date.now());
    this.setData({
      input: '',
      hint: state.locked
        ? `密码错太多次了，${state.lockedSeconds} 秒后再试`
        : `密码不对哦，还能试 ${state.failsLeft} 次`,
    });
    this.render();
  },

  /**
   * 设置段四个输入框。`dataset.field` 是字段名，白名单在 utils 里 ——
   * 这里只把值收进 `form`，**不落盘**（线上规则页那个边打边写的入口就是缺陷 3）。
   *
   * @param {object} event 小程序事件对象
   */
  onInputField(event) {
    const { field } = event.currentTarget.dataset;
    let value = event.detail.value;
    if (field === 'pin') value = value.replace(/\D/g, '').slice(0, 4);
    if (field === 'dailyGoal') value = value.replace(/\D/g, '').slice(0, 2);

    this.setData({ form: { ...this.data.form, [field]: value } });
  },

  /** 点「保存」：四个字段一次交给 saveSettings。PIN 不是 4 位就先拦在页面这一层 */
  onTapSave() {
    const { childName, pin, dailyGoal, note } = this.data.form;

    if (!/^\d{4}$/.test(pin)) {
      wx.showToast({ title: 'PIN 要是 4 位数字', icon: 'none', duration: 1500 });
      return;
    }

    const next = saveSettings(this.save, {
      childName,
      pin,
      note,
      // 空串按现值算：清空输入框不等于「目标是 0」
      dailyGoal: dailyGoal === '' ? this.data.state.dailyGoal : Number(dailyGoal),
    });

    // 无变化时原样返回入参（PARENT-15），不落盘
    if (next === this.save) {
      wx.showToast({ title: '没有改动', icon: 'none', duration: 1200 });
      return;
    }

    this.save = getApp().writeSave(next);
    this.render();
    wx.showToast({ title: '保存好啦', icon: 'none', duration: 1200 });
  },

  /** 导出：整份存档进剪贴板。只读操作，不需要确认 */
  onTapExport() {
    wx.setClipboardData({ data: exportJson(this.save) });
  },

  /**
   * 粘贴框。文本一变就把上一次的预览作废 ——
   * 否则「粘 A → 解析 → 换成 B → 点确认」会覆盖成 A。
   *
   * @param {object} event 小程序事件对象
   */
  onInputPaste(event) {
    this.pending = null;
    this.setData({ pasted: event.detail.value, preview: null });
  },

  /**
   * 点「看看这份数据」：`JSON.parse` 与 `importOnlineSave` **各自 try**，
   * 失败给出具体原因 —— 线上那个 unhandled rejection 分不清
   * 「导入失败」与「导入了空数据」（doc.md 缺陷 4）。
   *
   * 解析成功只出摘要，**不落盘**：摘要是覆盖前唯一能区分
   * 「粘对了」与「粘了别的」的东西。
   */
  onTapPreview() {
    const text = this.data.pasted.trim();
    if (text === '') {
      wx.showToast({ title: '先把 JSON 粘进来', icon: 'none', duration: 1500 });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      wx.showModal({
        title: '这段文字不是 JSON',
        content: `解析停在：${err.message}`,
        showCancel: false,
      });
      return;
    }

    let imported;
    try {
      imported = importOnlineSave(parsed);
    } catch (err) {
      wx.showModal({
        title: '这份 JSON 不像线上存档',
        content: err.message,
        showCancel: false,
      });
      return;
    }

    this.pending = imported;
    this.setData({ preview: parentState(imported, Date.now()).summary });
  },

  /** 点「确认覆盖」：整份覆盖（vision.md「数据迁移」一节早就定的，不做合并） */
  onTapImport() {
    if (this.pending === null) return;

    const summary = this.data.preview;
    wx.showModal({
      title: '用这份数据覆盖',
      content: `${summary.days} 天记录 · ${summary.chars} 字 · ${summary.poems} 首 · ${summary.rounds} 道题。现在这台机器上的进度会被换掉。`,
      confirmText: '覆盖',
      success: (res) => {
        if (!res.confirm) return;
        this.save = getApp().writeSave(this.pending);
        this.pending = null;
        this.setData({ pasted: '', preview: null });
        this.render();
        wx.showToast({ title: '导入好啦', icon: 'none', duration: 1500 });
      },
    });
  },

  /**
   * 清空数据。确认文案是「清空」而不是「确定」—— 点下去之前得读一遍那两个字
   * （doc.md 缺陷 5）。它藏在 PIN 后面、在页面最下面、字是灰的。
   */
  onTapReset() {
    wx.showModal({
      title: '清空所有数据',
      content: '打卡、星光、宠物、学过的字与诗全部回到刚装好的样子，没法撤回。',
      confirmText: '清空',
      confirmColor: '#c25b7c',
      success: (res) => {
        if (!res.confirm) return;
        this.save = getApp().writeSave(defaultSave());
        this.pending = null;
        // 清空之后 PIN 回到默认值，蒙层重新挡上 —— 不留在已解锁状态里
        this.setData({ unlocked: false, input: '', pasted: '', preview: null });
        this.render();
        wx.showToast({ title: '清空好啦', icon: 'none', duration: 1500 });
      },
    });
  },
});
