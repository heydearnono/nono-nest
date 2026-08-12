/**
 * 宠物形象表：5 个可选形象。
 *
 * 字段结构与来源见 docs/features/pet/doc.md（`data/petTypes.js` 一节）。
 *
 * 线上把这份数据放在两处：形象表 `ar`（`type` / `name` / `emoji`）与
 * `selectPet` 里的名字映射表。本仓库合成一张 —— 它们逐条一对一，
 * 分开放只会让下一个人以为可以不一致。
 *
 * `name` 是宠物自己的名字（线上 `selectPet` 的映射值），
 * `displayName` 是选择列表上那行小字（线上 `ar` 里的 `name`）。
 *
 * 本文件是常量区（AGENTS.md 第 3 节）：零函数、零判断、零计算。
 */
export const PET_TYPES = [
  { type: 'unicorn', name: '彩虹', displayName: '彩虹独角兽', emoji: '🦄' },
  { type: 'rabbit', name: '棉棉', displayName: '小兔子', emoji: '🐰' },
  { type: 'cat', name: '咪咪', displayName: '小猫', emoji: '🐱' },
  { type: 'fox', name: '狐狐', displayName: '小狐狸', emoji: '🦊' },
  { type: 'panda', name: '胖胖', displayName: '小熊猫', emoji: '🐼' },
];
