/**
 * 数学页：顶部阶段进度 + 一道题 + 底部三个圆点与六个阶段胶囊。
 *
 * 页面是适配层（AGENTS.md 第 3 节）：出哪三道题、选项什么顺序、点的这个下标对不对、
 * 够不够打卡、要不要升阶，全在 utils/math.js。这里只做取数、转发下标、落盘、弹提示，
 * 外加把五种题型的插图参数拼成能直接绑的字符串（`repeat` 在 WXML 里写不了）。
 *
 * **一次只显示一道题**（与识字页同一条）：答过的题标了 `answered`，
 * 队首取「今天还没答过的第一道」，答完重算一次状态，下一道自然顶上来 ——
 * 页面不维护「翻到第几道」的下标。
 *
 * `MATH_STAGES` 是六个阶段的名字，只为底部那排胶囊。`pages → data` 是允许的方向
 * （AGENTS.md 第 3 节），把六个名字抄进页面才是重复。
 */
import { MATH_STAGES } from '../../data/mathRounds.js';
import { dayKey } from '../../utils/dayKey.js';
import { answerRound, mathState } from '../../utils/math.js';

/** 对错反馈停留多久（毫秒），停完切下一道。doc.md 写的 1.5 秒 */
const FEEDBACK_MS = 1500;

/** 排队的 toast 之间隔多久，比 toast 自己的 1200 毫秒长一点，免得后一句吃掉前一句 */
const TOAST_GAP_MS = 1400;

Page({
  data: {
    /** mathState 的输出，见 utils/math.js */
    state: null,
    /** 当前这道题（今天还没答过的第一道），三道都答过时是 `null` */
    card: null,
    /** 当前这道题的插图参数，拼成能直接绑的字符串 */
    figure: null,
    /** 三个圆点：`'yes'` 答对 / `'no'` 答错 / `'none'` 今天还没答 */
    dots: [],
    /** 六个阶段胶囊：`'done'` 过去了 / `'on'` 当前 / `'off'` 还没到 */
    capsules: [],
    /** 刚点完的那一下：`{ ok, text }`，1.5 秒后清空 */
    feedback: null,
  },

  save: null,

  /** 反馈还在显示时锁住选项，免得连点把下一道题也答了 */
  locked: false,

  /** 排队中的 toast 定时器，onUnload 时清掉 */
  timers: [],

  onLoad() {
    // 用 onLoad 而非 onShow：navigateTo 进来的页面只 onLoad 一次（与其余四个子页一致）
    this.save = getApp().readSave();
    this.render();
  },

  onUnload() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  },

  /** 重算状态并把队首那道题挑出来。答题后与 onLoad 都走这里，只有一处取数逻辑 */
  render() {
    const now = Date.now();
    const state = mathState(this.save, dayKey(now), now);
    const card = state.rounds.find((item) => !item.answered) ?? null;

    this.setData({
      state,
      card,
      figure: card === null ? null : figureOf(card),
      // 圆点读的是历史上的 correct：今天答过的题里，「以前就答对过、今天又答错了」
      // 那一道（只有 Boss 天天回来，MATH-13）会显示成绿点。三个点是进度不是成绩单，
      // 为这一种情况在 mathState 里多存一个「今天答对没有」不值得
      dots: state.rounds.map((item) => (item.answered ? (item.correct ? 'yes' : 'no') : 'none')),
      capsules: MATH_STAGES.map((item) => ({
        stage: item.stage,
        name: item.name,
        state:
          item.stage < state.stage.stage ? 'done' : item.stage === state.stage.stage ? 'on' : 'off',
      })),
    });
  },

  /**
   * 点一个选项：`dataset.index` 是**打乱后**的下标，原样交给 answerRound
   * （页面不知道原始顺序，也不比对答案）。
   *
   * @param {object} event 小程序事件对象
   */
  onTapOption(event) {
    const card = this.data.card;
    if (card === null || this.locked) return;

    const choice = Number(event.currentTarget.dataset.index);
    const now = Date.now();
    const before = this.data.state;
    const next = answerRound(this.save, dayKey(now), card.id, choice, now);

    // 当天重复答同一道题原样返回（MATH-15）：不落盘，只说一句
    if (next === this.save) {
      wx.showToast({ title: '今天已经答过这道题啦 😊', icon: 'none', duration: 1200 });
      return;
    }

    const ok = choice === card.answerIndex;
    this.save = getApp().writeSave(next);
    this.locked = true;
    // 先只显示对错，1.5 秒后才切下一道 —— 立刻 render 会让题目在孩子眼前跳走
    this.setData({ feedback: { ok, text: ok ? '太棒啦！⭐' : '再试一次哦～' } });

    const after = mathState(this.save, dayKey(now), now);
    // 「刚升阶了没有」不是存档字段也不是返回值，页面比较前后 stage 自己判断（MATH-19）
    const messages = [];
    if (after.stage.stage !== before.stage.stage) {
      messages.push(`闯过一关！进入「${after.stage.name}」🎉`);
    }
    if (after.done && !before.done) messages.push('数学打卡完成 +2⭐ +8经验');
    this.queueToasts(messages);

    this.timers.push(
      setTimeout(() => {
        this.locked = false;
        this.setData({ feedback: null });
        this.render();
      }, FEEDBACK_MS),
    );
  },

  /**
   * 依次弹几句提示。升阶与打卡可能在同一次答题里一起发生（第 5 道恰好是当天第 3 道），
   * 两句 `showToast` 挨着调后一句会吃掉前一句 —— 线上就是这么丢掉升阶提示的（缺陷 10）。
   *
   * @param {string[]} messages 要弹的话，空数组时什么都不做
   */
  queueToasts(messages) {
    messages.forEach((title, i) => {
      this.timers.push(
        setTimeout(() => wx.showToast({ title, icon: 'none', duration: 1200 }), i * TOAST_GAP_MS),
      );
    });
  },
});

/**
 * 把卡片上的插图字段拼成能直接绑的字符串。`repeat` 在 WXML 里写不了，
 * 而 `mathState` 是纯函数、不该知道「画几个苹果」这种渲染细节。
 *
 * 五种题型里只有三种有插图：`count` 画 `target` 个 `items`、`compare` 画两边、
 * `sort` 把 `sequence` 排开。`choice` 与 `match` 只有题干与选项。
 *
 * @param {object} card mathState 给的卡片
 * @returns {object} `{ art, left, right, sequence }`，没有的落空值
 */
function figureOf(card) {
  const draw = (side) => (side === null ? null : { ...side, art: side.items.repeat(side.count) });

  return {
    // target 是 0 的题不存在，但 repeat 收到负数会抛错 —— 夹一下不多花什么
    art: card.kind === 'count' ? card.items.repeat(Math.max(0, card.target)) : '',
    left: card.kind === 'compare' ? draw(card.leftSide) : null,
    right: card.kind === 'compare' ? draw(card.rightSide) : null,
    sequence: card.kind === 'sort' ? card.sequence : [],
  };
}
