/**
 * 小程序入口。
 *
 * 这里是**适配层**：storage 读写与当前时间都在这一层，`utils/` 的纯函数不碰
 * `wx.*` 也不读 `Date.now()`（见 AGENTS.md 第 3 节）。
 *
 * 存档读写包装放在这里而不是各页面各写一遍：「读出来必须过 normalizeSave」
 * 这条规矩一旦有一个页面忘了，脏存档就直接进页面 data。
 */
import { seedHabits } from './utils/habit.js';
import { normalizeSave } from './utils/save.js';

/** 单条记录存整份存档，与线上 IndexedDB 的 `app-state` 同思路 */
const SAVE_KEY = 'nono-save';

App({
  globalData: {
    // 启动时间戳，后续用于计算宠物离线期间的状态变化
    launchedAt: 0,
  },

  onLaunch() {
    this.globalData.launchedAt = Date.now();
  },

  /**
   * 读存档。任何异常都退回默认存档 —— 读失败就白屏违反
   * docs/vision.md「什么算好」第 2 条。
   *
   * @returns {object} 合法存档，`habits` 已填默认任务表
   */
  readSave() {
    let raw;
    try {
      raw = wx.getStorageSync(SAVE_KEY);
    } catch (err) {
      console.error('[nono] 读存档失败，使用默认存档', err);
      raw = undefined;
    }

    return seedHabits(normalizeSave(raw));
  },

  /**
   * 写存档。落盘前盖上 `updatedAt`，首次写补 `createdAt`。
   *
   * @param {object} save 待落盘的存档
   * @returns {object} 实际落盘的存档（含时间戳），便于页面直接 setData
   */
  writeSave(save) {
    const now = Date.now();
    const next = normalizeSave({ ...save, createdAt: save.createdAt || now, updatedAt: now });

    try {
      wx.setStorageSync(SAVE_KEY, next);
    } catch (err) {
      // 写失败时不抛给页面：存档还在内存里，下一次操作会再试一遍
      console.error('[nono] 写存档失败', err);
    }

    return next;
  },
});
