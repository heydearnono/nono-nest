/**
 * 家长端的任务管理、兑换卡启用与兑换审批。
 *
 * 规格来源：docs/features/parent/doc.md（`PARENT` 区第二段 `PARENT-24` ~ `53`、
 * 第三段 `PARENT-72` ~ `77`）
 *
 * **这个模块是「家长域的写入口」，名字已经名不副实。** 第三段新增的看板与每日报告
 * 一个字都不写盘，所以它们在 `parentReport.js` 里 —— 拆模块的判据不是
 * 「碰哪个字段」（两边都读 `days` 与 `redemptions`），是**「它写不写盘」**。
 * 不改名：要动两处 import、一个测试文件与三份 `doc.md`，换来的只是一个更准的词。
 *
 * 依赖 point.js（`listCore`、`WEEKLY_BONUS.minDays`、`postLedger`）与
 * data/rewards.js（`toggleReward` 要认 id）。
 * **不 import habit.js**：`listHabits` 过滤 `enabled` 且只留 `habit` 类，
 * 而家长端要列**全部 18 条**（含停用的、含另两类）—— 需求正相反，复用它会把
 * 「停用之后再也开不回来」写进实现。同一条也适用于兑换卡：本模块自己从 `REWARDS` 列，
 * 不复用 `rewardState().items`（那一份已经过滤过停用的，`PARENT-53`）。
 *
 * 四条写入约定与第一段的 `saveSettings` 同形（parent/summary.md 定下的）：
 * 1. 可改字段走**白名单**，其余一概抛 `RangeError`；
 * 2. 未登记的 id 抛 `RangeError`（页面上的 id 全部来自 `parentTasks`）；
 * 3. 无变化**原样返回入参**（对象同一性），页面 `if (next === this.save) return`；
 * 4. 读取入口不抛错，写入入口严格。
 *
 * **没有 `removeHabit`。** 停用是软删除（`saveHabit(save, id, { enabled: false })`），
 * 硬删会让 `findHabit` 对历史打卡的 id 抛 `RangeError` —— 取消一条已删任务的打卡就白屏。
 * 这不是「以后再做」，是本轮的结论（doc.md 缺陷 7）。
 */

import { REWARDS } from '../data/rewards.js';
import { WEEKLY_BONUS, listCore, postLedger } from './point.js';

/**
 * 三类任务的排列次序，也是 `reindex` 重排 `sortOrder` 的次序。
 * 与 `save.js` 的 `HABIT_CATEGORIES` 是同一个数组 —— 那边夹存档，这边定顺序。
 */
const CATEGORY_ORDER = ['habit', 'learning', 'health'];

/** 只有 `habit` 类的 `name` / `icon` 能改，理由见 `editableOf` */
const NAME_EDITABLE_CATEGORY = 'habit';

/**
 * 单次打卡产出的上下界。上界与 `save.js` 的 `HABIT_REWARD_MAX` 是同一个 10：
 * 那边夹存档（不让脏数据撑大数字），这边夹家长的输入。
 */
const REWARD_MIN = 0;
const REWARD_MAX = 10;

/** 名字为空时的回落值。**只在 `saveHabit` 用** —— `addHabit` 那一侧抛错（PARENT-43） */
const FALLBACK_NAME = '未命名';

/** 图标为空时的回落值，与线上新增表单的默认图标一致 */
const FALLBACK_ICON = '⭐';

/**
 * `saveHabit` 的白名单，四组六个字段。
 *
 * 不可改的是 `id` / `category` / `frequency` / `module` / `weeklyTarget` /
 * `needsParentConfirm`：前四个改了等于换一条任务（`id` 丢历史、`category` 让它在
 * 另一个页面上现身、`module` 指向别的子页），后两个在全仓零读取点 ——
 * 给一个没人读的字段做输入框，是给家长一个改了不生效的旋钮。
 * `sortOrder` 单独抛错（只能走 `moveHabit`，见 `saveHabit`）。
 */
const EDITABLE_FIELDS = ['name', 'icon', 'enabled', 'core', 'starReward', 'petFoodReward'];

/** 产出的两个字段，夹范围的那一组 */
const REWARD_FIELDS = ['starReward', 'petFoodReward'];

/** `name` / `icon` 两个字段：只有 `habit` 类能改（PARENT-36） */
const NAME_FIELDS = ['name', 'icon'];

/** `addHabit` 的表单白名单。三个字段，`category` 只是为了能对非 `habit` 类抛错 */
const FORM_FIELDS = ['name', 'icon', 'category'];

/**
 * 兑换记录的两个终态，也是 `resolveRedemption` 的 `action` 白名单。
 * `'pending'` 不在里面 —— 它是起点，不是家长能选的动作。
 */
const RESOLVE_ACTIONS = ['done', 'cancelled'];

/** 待兑现的那个状态 */
const PENDING = 'pending';

/**
 * 存档里的 `habits`，非数组时给空数组。读取路径不抛错。
 *
 * @param {object} save 存档
 * @returns {object[]}
 */
function habitsOf(save) {
  return Array.isArray(save?.habits) ? save.habits.filter(isPlainObject) : [];
}

/**
 * @param {unknown} value 待判断的值
 * @returns {boolean} 是否为普通对象（排除 null 与数组）
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 非负整数，非数值给 fallback（`sortOrder` 的排序键要能比大小）。
 *
 * @param {unknown} value 待收敛的值
 * @param {number} fallback 无法解释成数值时的取值
 * @returns {number}
 */
function intOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

/**
 * 同一类里按 `sortOrder` 升序（脏存档里可能有重复值，`sort` 的稳定性保证结果确定）。
 *
 * @param {object[]} list 任务定义
 * @returns {object[]} 新数组
 */
function bySortOrder(list) {
  return list.slice().sort((a, b) => intOr(a.sortOrder, 0) - intOr(b.sortOrder, 0));
}

/**
 * `name` / `icon` 改不改得了。**由 utils 算，不让页面判 `category`** ——
 * 页面判等于把「哪些字段哪一类能改」抄第二遍，而 `saveHabit` 的白名单已经是唯一处。
 *
 * `learning` 的名字在入口页由 `data/learningModules.js` 给（改了任务名入口页不跟着变，
 * 两处会不一致），`health` 的名字写在健康页的模板里。产出值与 `enabled` / `core`
 * 三类都能改 —— 那三个是本仓库真的会读的字段。
 *
 * @param {object} habit 任务定义
 * @returns {boolean}
 */
function editableOf(habit) {
  return habit.category === NAME_EDITABLE_CATEGORY;
}

/**
 * 按 `habit` → `learning` → `health` 的次序排列（组内按 `sortOrder` 升序）。
 * 未登记的 `category`（脏存档）排在三段之后，**不丢** —— 本层不认得的不删。
 *
 * 只排列、**不改 `sortOrder` 的值** —— 读取路径给页面的必须是存档里的那个数字。
 * 重排编号是 `reindex` 的事（写入路径）。
 *
 * @param {object[]} list 任务定义
 * @returns {object[]} 新数组，元素是原对象
 */
function ordered(list) {
  const out = [];

  for (const category of CATEGORY_ORDER) {
    out.push(...bySortOrder(list.filter((habit) => habit.category === category)));
  }
  out.push(...bySortOrder(list.filter((habit) => !CATEGORY_ORDER.includes(habit.category))));

  return out;
}

/**
 * 把整个数组的 `sortOrder` 重排成全局连续的 `1..N`（次序即 `ordered` 给的次序）。
 *
 * **为什么整段重排而不是交换两个值**：交换只在「当前值本来就连续无重复」时正确，
 * 而线上 `addTask` 用 `tasks.length + 1` 当序号、删过任务之后必然与既有的撞
 * （doc.md 缺陷 8），导入来的存档里就可能有重复值。重排让「值是否连续」
 * 不再是前提 —— 第一次调用就把撞的解开（`PARENT-48`）。
 *
 * `addHabit` 用同一个 `reindex`，所以新任务排在 `habit` 段末尾之后，
 * `learning` / `health` 两段整体后移一位 —— **段与段永不交叠**。
 *
 * @param {object[]} list 任务定义
 * @returns {object[]} 新数组，元素也是新对象
 */
function reindex(list) {
  return ordered(list).map((habit, index) => ({ ...habit, sortOrder: index + 1 }));
}

/**
 * 任务段的读取入口。**列全部 18 条，不过滤 `enabled`** —— 与 `listHabits` 正相反：
 * 家长端要看见停用的那些，否则关掉之后就再也开不回来。同一条适用于 `rewards`。
 *
 * **不抛错**（渲染路径宽容）：`habits` 缺失、元素有脏字段都只影响数值。
 *
 * `coreWarn` 是**原因码**（`null` / `'none'` / `'few'`）而不是布尔：页面不写
 * `coreCount === 0 ? … : coreCount < 5 ? …` 这种链，因为那个 `5` 是
 * `WEEKLY_BONUS.minDays`，属于 `POINT` 区。它是**提示不是门禁** ——
 * 家长可以把七条核心项全关掉（孩子生病那周不要求排便打卡），
 * `awardAllDone` 的 `core.length === 0` 那一支 P3-b 就写好了（`POINT-26`）。
 *
 * @param {object} save 存档
 * @returns {{ habits: object[], coreCount: number, coreWarn: null | 'none' | 'few',
 *             rewards: object[], pending: object[] }}
 */
export function parentTasks(save) {
  const list = ordered(habitsOf(save));
  const flags = isPlainObject(save?.rewardFlags) ? save.rewardFlags : {};
  // 分母的口径与首页、周奖励完全一致（core && enabled），不在本层重写一遍
  const coreCount = listCore({ habits: list }).length;
  const lastOf = new Map(list.map((habit) => [habit.category, habit.id]));
  const firstOf = new Map();
  for (const habit of list) {
    if (!firstOf.has(habit.category)) firstOf.set(habit.category, habit.id);
  }

  let coreWarn = null;
  if (coreCount === 0) coreWarn = 'none';
  else if (coreCount < WEEKLY_BONUS.minDays) coreWarn = 'few';

  return {
    habits: list.map((habit) => ({
      ...habit,
      // editable / first / last 都由本层算：页面判 category 或 index === 0
      // 等于把同一个判断抄第二遍（同一条见 petState().types / READ_OPTIONS）
      editable: editableOf(habit),
      // 上移 / 下移只在同类内移动，所以边界也是同类内的边界
      first: firstOf.get(habit.category) === habit.id,
      last: lastOf.get(habit.category) === habit.id,
    })),
    coreCount,
    coreWarn,
    // 三条卡**全都列**（含停用的），不复用 rewardState().items ——
    // 那一份已经过滤过停用的，家长端拿它就再也开不回来（PARENT-53）
    rewards: REWARDS.map((reward) => ({ ...reward, enabled: flags[reward.id] !== false })),
    // 卡是「能换什么」，pending 是「换了还没给」—— 同一件事的两半，所以同一个入口。
    // **空列表是 [] 不是 null**：线上 bB() 空时 return null，整块卡片消失，
    // 而它是全应用里唯一能看到那条申请的地方（PARENT-77）
    pending: (Array.isArray(save?.redemptions) ? save.redemptions : [])
      .filter(isPlainObject)
      .filter((item) => item.status === PENDING),
  };
}

/**
 * 找一条任务，找不到就抛错（与 `findHabit` / `findReward` 同一条：
 * 页面上的 id 全部来自 `parentTasks`，传别的值只可能是编程错误）。
 *
 * @param {object[]} list 任务定义
 * @param {string} habitId 任务 id
 * @returns {object} 任务定义
 * @throws {RangeError} 未登记的 id
 */
function findIn(list, habitId) {
  const habit = list.find((item) => item.id === habitId);
  if (!habit) {
    throw new RangeError(`habitId ${JSON.stringify(habitId)} 不在 habits 里`);
  }
  return habit;
}

/**
 * 改一条任务。`patch` 走**六个字段的白名单**（`name` / `icon` / `enabled` / `core` /
 * `starReward` / `petFoodReward`），其余一概抛 `RangeError`。
 *
 * 三种不同的「不能改」，各挡一个方向：
 * 1. **未登记的字段**（`id` / `category` / `frequency` / `module` / `weeklyTarget` /
 *    `needsParentConfirm` 与任何拼错的键）—— `PARENT-34`；
 * 2. **`sortOrder`** 单独抛：它是登记过的字段，但只能走 `moveHabit`（`PARENT-35`）——
 *    两个入口会让「每次重排成 `1..N`」这个前提失效；
 * 3. **`learning` / `health` 两类的 `name` / `icon`**（`PARENT-36`）：那两类的显示名
 *    在别处（`data/learningModules.js` / 健康页模板），改了会两处不一致。
 *
 * `name` 全空白**回落 `'未命名'`**（`PARENT-33`），不抛错 —— 与 `addHabit` 故意不一致：
 * 这里是「家长清空了输入框又保存」，属于宽容的一侧；那里是提交路径，名字是必填项。
 *
 * 无变化时**原样返回入参**（对象同一性，`PARENT-39`）。
 *
 * @param {object} save 存档
 * @param {string} habitId 任务 id
 * @param {object} patch 要改的字段，键必须在白名单里
 * @returns {object} 新存档，或入参本身
 * @throws {RangeError} 未登记的字段、`sortOrder`、不可改的 `name` / `icon`、未知 id
 */
export function saveHabit(save, habitId, patch) {
  if (!isPlainObject(patch)) {
    throw new RangeError(`patch 必须是普通对象，收到 ${JSON.stringify(patch)}`);
  }

  const list = habitsOf(save);
  const habit = findIn(list, habitId);

  for (const field of Object.keys(patch)) {
    if (field === 'sortOrder') {
      throw new RangeError('sortOrder 只能经 moveHabit 改（每次重排成 1..N）');
    }
    if (!EDITABLE_FIELDS.includes(field)) {
      throw new RangeError(
        `${JSON.stringify(field)} 不是可改字段，只能改 ${EDITABLE_FIELDS.join(' / ')}`,
      );
    }
    if (NAME_FIELDS.includes(field) && !editableOf(habit)) {
      throw new RangeError(
        `${JSON.stringify(habit.category)} 类任务的 ${field} 不能改（显示名在别处定义）`,
      );
    }
  }

  const next = { ...habit };

  if ('name' in patch) {
    const name = typeof patch.name === 'string' ? patch.name.trim() : '';
    next.name = name === '' ? FALLBACK_NAME : name;
  }
  if ('icon' in patch) {
    const icon = typeof patch.icon === 'string' ? patch.icon.trim() : '';
    next.icon = icon === '' ? FALLBACK_ICON : icon;
  }
  if ('enabled' in patch) next.enabled = patch.enabled === true;
  if ('core' in patch) next.core = patch.core === true;

  for (const field of REWARD_FIELDS) {
    if (!(field in patch)) continue;
    if (typeof patch[field] !== 'number' || !Number.isFinite(patch[field])) {
      throw new RangeError(`${field} 必须是有限数，收到 ${JSON.stringify(patch[field])}`);
    }
    next[field] = Math.min(REWARD_MAX, Math.max(REWARD_MIN, Math.round(patch[field])));
  }

  const changed = Object.keys(next).some((field) => next[field] !== habit[field]);
  if (!changed) return save;

  return { ...save, habits: list.map((item) => (item.id === habitId ? next : item)) };
}

/**
 * 加一条任务。**只能加 `habit` 类**（`PARENT-44`）：另外两类加了不管用 ——
 * `learning` 的 `module` 没有对应子页（`habitOf` 找不到它），`health` 的
 * `FIELDS` 是十一个写死的字段、健康页不会长出一格。判据是「加完之后有没有地方
 * 能打上这一卡」，不是「哪一类看起来更重要」（`AGENTS.md` 第 5 节第 4 条：
 * 不写不可达的路径）。
 *
 * `id` 由**传进来的 `now`** 拼成 `` `t${now}` ``，撞了追加 `-2` / `-3`
 * （同一毫秒连点两次的唯一可能，`PARENT-42`）。`utils/` 里不能读 `Date.now()`
 * 也不能有随机源（第 3 节），所以它仍是纯函数：同样的 `save` 与 `now` 给同样的 id。
 * **不用 `habit-19` 这种序号**：序号会与「停用不删」打架 —— 删不掉的旧任务让序号
 * 只增不减，而看到 `habit-42` 的人会以为有 42 条任务。
 *
 * 名字**全空白抛 `RangeError`**（`PARENT-43`），与 `saveHabit` 的回落故意不一致：
 * 新增是提交路径，名字是必填项；页面那一侧也会先挡一次（不让它抛到 utils）。
 *
 * `core` 落 `false`：家长新加的任务不该自动进今日全勤的分母 ——
 * 那会让「今天全勤」的门槛在她加完任务的那一刻悄悄变高。要计入得自己勾。
 *
 * @param {object} save 存档
 * @param {object} form `{ name, icon?, category? }`
 * @param {number} now 毫秒时间戳，由页面层传入（`id` 要用它拼）
 * @returns {object} 新存档
 * @throws {RangeError} 名字为空、非 `habit` 类、未登记的表单字段
 * @throws {TypeError} `now` 非有限数
 */
export function addHabit(save, form, now) {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数的毫秒时间戳，收到 ${now}`);
  }
  if (!isPlainObject(form)) {
    throw new RangeError(`form 必须是普通对象，收到 ${JSON.stringify(form)}`);
  }

  for (const field of Object.keys(form)) {
    if (!FORM_FIELDS.includes(field)) {
      throw new RangeError(
        `${JSON.stringify(field)} 不是新增表单的字段，只能传 ${FORM_FIELDS.join(' / ')}`,
      );
    }
  }

  const category = form.category ?? NAME_EDITABLE_CATEGORY;
  if (category !== NAME_EDITABLE_CATEGORY) {
    throw new RangeError(
      `只能新增 ${NAME_EDITABLE_CATEGORY} 类任务，收到 ${JSON.stringify(category)}` +
        '（另两类加完没有页面能打上这一卡）',
    );
  }

  const name = typeof form.name === 'string' ? form.name.trim() : '';
  if (name === '') {
    throw new RangeError('新增任务的名字是必填项（saveHabit 那一侧才回落「未命名」）');
  }

  const icon =
    typeof form.icon === 'string' && form.icon.trim() !== '' ? form.icon.trim() : FALLBACK_ICON;
  const list = habitsOf(save);
  const taken = new Set(list.map((habit) => habit.id));
  let id = `t${now}`;
  for (let n = 2; taken.has(id); n += 1) id = `t${now}-${n}`;

  const entry = {
    id,
    name,
    icon,
    category,
    frequency: 'daily',
    starReward: 1,
    petFoodReward: 1,
    needsParentConfirm: false,
    enabled: true,
    // 排在 habit 段末尾：这个值只是给 reindex 排序用的，落盘的是重排后的编号
    sortOrder: list.reduce((max, habit) => Math.max(max, intOr(habit.sortOrder, 0)), 0) + 1,
    core: false,
  };

  return { ...save, habits: reindex([...list, entry]) };
}

/**
 * 上移 / 下移一条任务，**只在同一 `category` 内**移动。跨类不移：三类分别渲染在
 * 首页九格、学习入口页、健康页，把一条 `health` 移到 `habit` 中间没有任何可观测效果。
 *
 * 落盘前走 `reindex`，把三段重排成全局连续的 `1..N` —— 所以「在 `learning` 段内下移」
 * 不会改到另外两段的任何一个值（`PARENT-49`）。
 *
 * `delta` 只认 `-1` / `1`，其余抛 `RangeError`（页面只有两个按钮）。
 * 移到边界外**返回入参本身**（`PARENT-47`）—— 与 `parentTasks` 的 `first` / `last`
 * 说同一件事：那两个是给按钮置灰的，这一条是给「点了也没事」的。
 *
 * @param {object} save 存档
 * @param {string} habitId 任务 id
 * @param {-1 | 1} delta 上移 `-1` / 下移 `1`
 * @returns {object} 新存档，或入参本身
 * @throws {RangeError} `delta` 不是 `-1` / `1`、未知 id
 */
export function moveHabit(save, habitId, delta) {
  if (delta !== -1 && delta !== 1) {
    throw new RangeError(`delta 只能是 -1 或 1，收到 ${JSON.stringify(delta)}`);
  }

  const list = habitsOf(save);
  const habit = findIn(list, habitId);
  const group = ordered(list).filter((item) => item.category === habit.category);
  const from = group.findIndex((item) => item.id === habitId);
  const to = from + delta;
  if (to < 0 || to >= group.length) return save;

  const moved = group.slice();
  [moved[from], moved[to]] = [moved[to], moved[from]];

  // 换位之后**先把组内序号按新位置写一遍**：reindex 内部的 ordered 是按 sortOrder
  // 排的，只换数组位置不改值会被它排回去（组内 1..n 与全局无关，下一行会重排）
  const relabeled = moved.map((item, index) => ({ ...item, sortOrder: index + 1 }));

  // 组内换位之后重排全局编号：其余两段的相对顺序不变，值也不变
  const rest = list.filter((item) => item.category !== habit.category);
  const next = reindex([...rest, ...relabeled]);

  return { ...save, habits: next };
}

/**
 * 兑换卡的启用 / 停用。**写入是家长域的动作**，所以它在本模块而不是 `reward.js`
 * （那一侧只加读取时的守卫，`REWARD-16` / `REWARD-17`）。
 *
 * 未登记的 id 抛 `RangeError`（页面的 id 全部来自 `parentTasks().rewards`）。
 *
 * 落盘的是 `rewardFlags[id]`，**不动 `data/rewards.js`** —— 卡的定义留在常量里，
 * 家长只能开关，**改价不做**（doc.md 缺陷 10）。缺键当启用，所以第一次停用
 * 写的是 `false`、再点一次写 `true`（不是删键：删了与「从未设置过」不可区分，
 * 而两者行为相同 —— 留着 `true` 更好读）。
 *
 * @param {object} save 存档
 * @param {string} rewardId 奖励项 id
 * @returns {object} 新存档
 * @throws {RangeError} 未登记的 id
 */
export function toggleReward(save, rewardId) {
  if (!REWARDS.some((reward) => reward.id === rewardId)) {
    throw new RangeError(`rewardId ${JSON.stringify(rewardId)} 不在 data/rewards.js 里`);
  }

  const flags = isPlainObject(save?.rewardFlags) ? save.rewardFlags : {};

  return { ...save, rewardFlags: { ...flags, [rewardId]: flags[rewardId] === false } };
}

/**
 * 兑现或驳回一条兑换申请。**一个函数两个动作**（`PARENT-72` ~ `77`）。
 *
 * 线上分成 `approveExchange` / `rejectExchange` 两个，而其中一个**漏了状态检查**
 * （doc.md 缺陷 17）—— 已经批过的记录还能再被驳回。两个动作共用三件事：
 * 找到那条记录、状态必须是 `'pending'`、只改一条。**一个入口比两个入口各查一次可靠**，
 * 与第一段「改 PIN 只剩 `saveSettings` 一个入口」同一条。
 *
 * **`'done'` 一分钱不动。** 申请那一刻 `redeem` 已经 `postLedger('spend')` 扣过了
 * （本仓库申请即扣，线上是批准时才扣）—— 所以家长这个按钮回答的是
 * 「东西给了没有」，不是「钱付了没有」。
 *
 * **`'cancelled'` 退回 `medalCost`，而退款走 `postLedger`。** 不是
 * `{ ...save, currency }` —— `point.js::postLedger` 的头注释写着「`save.currency`
 * 只可能被 `point.js` 改，而它每次改都追加一条流水」。**退款落在驳回那一天的流水里**，
 * 不是申请那一天：流水回答的是「那天发生了什么」，而退款发生在今天，
 * 所以 `key` 是入参（页面给 `dayKey(now)`，`utils/` 不读时钟）。
 *
 * **记录的身份是 `at`，不是数组下标**：`redemptions` 的元素没有 id
 * （`redemptionsFromOnline` 连线上那个都不接），而下标会因为「列表渲染之后孩子
 * 又申请了一条」指向另一条。
 *
 * 那条记录**已经不是 `'pending'` 时原样返回入参**，不抛错：家长在两处各点一下是
 * 竞态，不是编程错误（与 `redeem` 遇到停用卡同一条）。
 *
 * @param {object} save 存档
 * @param {string} key 日期键（退款流水落在这一天）
 * @param {number} at 那条记录的 `at`（毫秒时间戳，它的身份）
 * @param {'done' | 'cancelled'} action 兑现或驳回
 * @param {number} now 毫秒时间戳
 * @returns {object} 新存档，或入参本身
 * @throws {RangeError} `at` 找不到、`action` 不在白名单里
 * @throws {TypeError} `now` 非有限数
 */
export function resolveRedemption(save, key, at, action, now) {
  if (!RESOLVE_ACTIONS.includes(action)) {
    throw new RangeError(
      `action 只能是 ${RESOLVE_ACTIONS.join(' / ')}，收到 ${JSON.stringify(action)}`,
    );
  }
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new TypeError(`now 必须是有限数，收到 ${JSON.stringify(now)}`);
  }

  const list = Array.isArray(save?.redemptions) ? save.redemptions : [];
  const index = list.findIndex((item) => isPlainObject(item) && item.at === at);
  if (index === -1) {
    throw new RangeError(`at ${JSON.stringify(at)} 不在 redemptions 里`);
  }

  const record = list[index];
  if (record.status !== PENDING) return save;

  const redemptions = list.slice();
  redemptions[index] = { ...record, status: action };
  const next = { ...save, redemptions };

  if (action !== 'cancelled') return next;

  // 退款走 postLedger：账与余额一起动，一次也不分叉
  return postLedger(
    next,
    key,
    'earn',
    { star: 0, gem: 0, petFood: 0, medal: intOr(record.medalCost, 0) },
    `退回：${record.name}`,
    now,
  );
}
