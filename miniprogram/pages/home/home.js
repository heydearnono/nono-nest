import { dayKey } from '../../utils/dayKey.js';
import { greetingFor } from '../../utils/greeting.js';
import { dayProgress, habitStreak, isChecked, listHabits } from '../../utils/habit.js';
import { checkAwardAndGrow } from '../../utils/pet.js';
import { uncheckAndRefund } from '../../utils/point.js';

/**
 * 首页。适配层：读存档、取当前时间、setData、写存档。
 * 任何阈值与公式都在 utils/ 里，这里不做业务判断（AGENTS.md 第 3 节）。
 */
Page({
  data: {
    greeting: '',
    /** 打卡格子，每项是 { id, name, icon, checked } */
    items: [],
    done: 0,
    total: 0,
    streak: 0,
    /** 货币余额。宝石与勋章打卡产不出，不显示恒为 0 的数字 */
    star: 0,
    petFood: 0,
  },

  /** 内存里的当前存档。不放进 data —— 存档比页面要渲染的东西大得多 */
  save: null,

  onShow() {
    // 用 onShow 而非 onLoad：跨零点后回到前台，日期键必须重算
    this.save = getApp().readSave();
    this.render();
  },

  /**
   * 把当前存档投影成页面 data。
   */
  render() {
    const now = Date.now();
    const today = dayKey(now);

    this.setData({
      greeting: greetingFor(new Date(now).getHours()),
      items: listHabits(this.save).map((habit) => ({
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        checked: isChecked(this.save, today, habit.id),
      })),
      ...dayProgress(this.save, today),
      streak: habitStreak(this.save, now),
      star: this.save.currency.star,
      petFood: this.save.currency.petFood,
    });
  },

  /**
   * 点一下切换打卡状态：打卡走 PET 区的外层函数（发货币 + 涨经验与开心度），
   * 取消只走 POINT 区退货币 —— 撤回不收回经验、不降开心度
   * （「温和，不惩罚」，见 docs/features/pet/doc.md）。
   *
   * @param {object} event 小程序事件对象，`dataset.id` 是任务 id
   */
  onTapHabit(event) {
    const { id } = event.currentTarget.dataset;
    const now = Date.now();
    const today = dayKey(now);
    const wasChecked = isChecked(this.save, today, id);

    const next = wasChecked
      ? uncheckAndRefund(this.save, today, id, now)
      : checkAwardAndGrow(this.save, today, id, now);

    const gained = next.currency.star - this.save.currency.star;
    this.save = getApp().writeSave(next);
    this.render();

    wx.showToast({
      title: wasChecked ? '已取消打卡' : `太棒啦！+${gained}⭐`,
      icon: 'none',
      duration: 1200,
    });
  },
});
