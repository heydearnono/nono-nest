/**
 * 奖励项表：三条，从线上工作台的 `rewardRules` 原样转抄。
 *
 * 字段结构与取舍见 docs/features/reward/doc.md（`data/rewards.js` 一节）。
 *
 * **id 与 medalCost 不可随手改**：`redemptions` 里的历史记录按 id 存，
 * `name` / `icon` / `medalCost` 在记录里是**快照**（兑换当时的名字与价格），
 * 所以改这里不会改写历史 —— 但改 id 会让旧记录对不上任何一条奖励。
 *
 * 线上元素还有 `needsConfirm` 与 `enabled`，三条取值全相同且本轮兑换流程里
 * 没有分支读它们，是死字段，不转抄（与 `defaultHabits.js` 不转抄 `subCategory` 同一条）。
 * 奖励项的启用与改价要等 P7。
 *
 * 本文件是常量区（AGENTS.md 第 3 节）：零函数、零判断、零计算。
 */
export const REWARDS = [
  { id: 'snack', name: '零食一次', icon: '🍪', medalCost: 2 },
  { id: 'cartoon', name: '动画片1集', icon: '📺', medalCost: 3 },
  { id: 'money', name: '5元零花钱', icon: '💰', medalCost: 5 },
];
