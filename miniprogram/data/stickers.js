/**
 * 140 张贴纸：收集模块的内容资产，零逻辑（AGENTS.md 第 3 节）。
 *
 * 来源：线上工作台 <https://xiaoluzhu.net/> bundle 里的 `mo`
 * （`.scratch/index-VUOSJfWA.js:264485`，140 个四元组 `[emoji, name, category, rarity]`），
 * 机械转写而来 —— 四个字段值一字不改。逐条数过的事实见
 * docs/features/sticker/doc.md「线上的贴纸」。
 *
 * **`id` 是本文件唯一一处不照搬的地方，它写死在字面量里。** 线上的 id 是运行时算的
 * （`z(name, i) => `st-${String(i).padStart(3, '0')}-${name}``，`:269915`），
 * 而 `padStart` 是计算 —— 常量区不许有函数、判断、计算，所以只能写死。
 * 这条约束顺带修掉了线上一个缺陷：`stickerCollection` 的键就是这些 id，
 * 线上给 `mo` 排一次序，历史收藏册的每一个键都会**静默**对不上（140 张全变「没抽到」，
 * 无任何报错）。写死之后重排不再改 id。
 *
 * **顺序仍然是规格，但理由与 `characters.js` / `poems.js` 不同。** 那两份的顺序是
 * 教学序列（先学最常见的字、先背最浅的诗），重排会毁掉难度梯度；本份只是**图鉴的排版**
 * ——140 格按类别聚成六段显示，重排只是显示的段落变了，不再牵动任何 id 或进度。
 * 所以三份「顺序即规格」里本份最弱：不要因为那两份不可动就以为这份同样不可动。
 *
 * **140 条，而界面上那句「约 200 个贴纸」与实际不符**（线上文案，逐条数过是 140）。
 * 以本文件为准，不要去凑那个 200。
 *
 * `id` 里嵌着中文名，看着别扭，**不改**：线上收藏册的键已经是这个形状，
 * 换成 `st-000` 就要在导入时改写键，而那需要一张 140 行、只为了好看的映射表。
 *
 * 本文件是常量区（AGENTS.md 第 3 节）：零函数、零判断、零计算。
 */

/**
 * 六个类别的中文标签，照搬线上 `bo`（`.scratch/index-VUOSJfWA.js:270406`）。
 * 页面**不映射文案** —— `utils/sticker.js` 查这张表，把 `categoryLabel` 一起给出去。
 */
export const CATEGORY_LABEL = {
  animal: '动物',
  food: '美食',
  nature: '自然',
  cute: '可爱',
  star: '星星',
  fantasy: '奇幻',
};

/**
 * 三档稀有度的中文标签，照搬线上 `xo`（同一处偏移）。
 * 注意 `uncommon` 的中文是「稀有」、`rare` 才是「超稀有」—— 线上就是这么错位的，
 * 照搬不改：改了会与孩子已经看惯的那两个词不一致。
 * 线上另有一张 `So`（三套 Tailwind ring 类名），**不搬** —— 样式是页面的事。
 */
export const RARITY_LABEL = {
  common: '普通',
  uncommon: '稀有',
  rare: '超稀有',
};

/**
 * @type {{ id: string, emoji: string, name: string,
 *          category: 'animal' | 'food' | 'nature' | 'cute' | 'star' | 'fantasy',
 *          rarity: 'common' | 'uncommon' | 'rare' }[]}
 * 140 条，顺序即图鉴排版。按类别聚成六段，分界下标
 * `0` animal(32) / `32` food(24) / `56` nature(22) / `78` cute(24) / `102` star(18) /
 * `120` fantasy(20)；稀有度计数 `common` 84 / `uncommon` 37 / `rare` 19
 */
export const STICKERS = [
  { id: 'st-000-小狗狗', emoji: '🐶', name: '小狗狗', category: 'animal', rarity: 'common' },
  { id: 'st-001-小猫咪', emoji: '🐱', name: '小猫咪', category: 'animal', rarity: 'common' },
  { id: 'st-002-小兔子', emoji: '🐰', name: '小兔子', category: 'animal', rarity: 'common' },
  { id: 'st-003-小熊熊', emoji: '🐻', name: '小熊熊', category: 'animal', rarity: 'common' },
  { id: 'st-004-小熊猫', emoji: '🐼', name: '小熊猫', category: 'animal', rarity: 'common' },
  { id: 'st-005-考拉宝', emoji: '🐨', name: '考拉宝', category: 'animal', rarity: 'common' },
  { id: 'st-006-小老虎', emoji: '🐯', name: '小老虎', category: 'animal', rarity: 'uncommon' },
  { id: 'st-007-小狮子', emoji: '🦁', name: '小狮子', category: 'animal', rarity: 'uncommon' },
  { id: 'st-008-呱呱蛙', emoji: '🐸', name: '呱呱蛙', category: 'animal', rarity: 'common' },
  { id: 'st-009-粉红猪', emoji: '🐷', name: '粉红猪', category: 'animal', rarity: 'common' },
  { id: 'st-010-牛牛', emoji: '🐮', name: '牛牛', category: 'animal', rarity: 'common' },
  { id: 'st-011-小鸡仔', emoji: '🐔', name: '小鸡仔', category: 'animal', rarity: 'common' },
  { id: 'st-012-企鹅宝', emoji: '🐧', name: '企鹅宝', category: 'animal', rarity: 'uncommon' },
  { id: 'st-013-小鸟儿', emoji: '🐦', name: '小鸟儿', category: 'animal', rarity: 'common' },
  { id: 'st-014-小鸭鸭', emoji: '🦆', name: '小鸭鸭', category: 'animal', rarity: 'common' },
  { id: 'st-015-花蝴蝶', emoji: '🦋', name: '花蝴蝶', category: 'animal', rarity: 'common' },
  { id: 'st-016-小蜜蜂', emoji: '🐝', name: '小蜜蜂', category: 'animal', rarity: 'common' },
  { id: 'st-017-瓢虫妹', emoji: '🐞', name: '瓢虫妹', category: 'animal', rarity: 'common' },
  { id: 'st-018-独角兽', emoji: '🦄', name: '独角兽', category: 'animal', rarity: 'rare' },
  { id: 'st-019-海豚君', emoji: '🐬', name: '海豚君', category: 'animal', rarity: 'uncommon' },
  { id: 'st-020-小鲸鱼', emoji: '🐳', name: '小鲸鱼', category: 'animal', rarity: 'uncommon' },
  { id: 'st-021-小狐狸', emoji: '🦊', name: '小狐狸', category: 'animal', rarity: 'common' },
  { id: 'st-022-小狼狼', emoji: '🐺', name: '小狼狼', category: 'animal', rarity: 'uncommon' },
  { id: 'st-023-猫头鹰', emoji: '🦉', name: '猫头鹰', category: 'animal', rarity: 'uncommon' },
  { id: 'st-024-慢乌龟', emoji: '🐢', name: '慢乌龟', category: 'animal', rarity: 'common' },
  { id: 'st-025-刺刺球', emoji: '🦔', name: '刺刺球', category: 'animal', rarity: 'uncommon' },
  { id: 'st-026-松鼠酱', emoji: '🐿️', name: '松鼠酱', category: 'animal', rarity: 'common' },
  { id: 'st-027-火烈鸟', emoji: '🦩', name: '火烈鸟', category: 'animal', rarity: 'rare' },
  { id: 'st-028-章鱼哥', emoji: '🐙', name: '章鱼哥', category: 'animal', rarity: 'uncommon' },
  { id: 'st-029-螃蟹钳', emoji: '🦀', name: '螃蟹钳', category: 'animal', rarity: 'common' },
  { id: 'st-030-热带鱼', emoji: '🐠', name: '热带鱼', category: 'animal', rarity: 'common' },
  { id: 'st-031-海豹团', emoji: '🦭', name: '海豹团', category: 'animal', rarity: 'uncommon' },
  { id: 'st-032-红苹果', emoji: '🍎', name: '红苹果', category: 'food', rarity: 'common' },
  { id: 'st-033-大草莓', emoji: '🍓', name: '大草莓', category: 'food', rarity: 'common' },
  { id: 'st-034-水蜜桃', emoji: '🍑', name: '水蜜桃', category: 'food', rarity: 'common' },
  { id: 'st-035-小樱桃', emoji: '🍒', name: '小樱桃', category: 'food', rarity: 'common' },
  { id: 'st-036-紫葡萄', emoji: '🍇', name: '紫葡萄', category: 'food', rarity: 'common' },
  { id: 'st-037-大西瓜', emoji: '🍉', name: '大西瓜', category: 'food', rarity: 'common' },
  { id: 'st-038-香蕉君', emoji: '🍌', name: '香蕉君', category: 'food', rarity: 'common' },
  { id: 'st-039-小橘子', emoji: '🍊', name: '小橘子', category: 'food', rarity: 'common' },
  { id: 'st-040-猕猴桃', emoji: '🥝', name: '猕猴桃', category: 'food', rarity: 'uncommon' },
  { id: 'st-041-曲奇饼', emoji: '🍪', name: '曲奇饼', category: 'food', rarity: 'common' },
  { id: 'st-042-纸杯糕', emoji: '🧁', name: '纸杯糕', category: 'food', rarity: 'common' },
  { id: 'st-043-小蛋糕', emoji: '🍰', name: '小蛋糕', category: 'food', rarity: 'common' },
  { id: 'st-044-甜甜圈', emoji: '🍩', name: '甜甜圈', category: 'food', rarity: 'common' },
  { id: 'st-045-棒棒糖', emoji: '🍭', name: '棒棒糖', category: 'food', rarity: 'common' },
  { id: 'st-046-糖果糖', emoji: '🍬', name: '糖果糖', category: 'food', rarity: 'common' },
  { id: 'st-047-巧克力', emoji: '🍫', name: '巧克力', category: 'food', rarity: 'common' },
  { id: 'st-048-冰淇淋', emoji: '🍦', name: '冰淇淋', category: 'food', rarity: 'common' },
  { id: 'st-049-三色团', emoji: '🍡', name: '三色团', category: 'food', rarity: 'uncommon' },
  { id: 'st-050-布丁喵', emoji: '🍮', name: '布丁喵', category: 'food', rarity: 'common' },
  { id: 'st-051-牛奶杯', emoji: '🥛', name: '牛奶杯', category: 'food', rarity: 'common' },
  { id: 'st-052-爆米花', emoji: '🍿', name: '爆米花', category: 'food', rarity: 'common' },
  { id: 'st-053-披萨片', emoji: '🍕', name: '披萨片', category: 'food', rarity: 'uncommon' },
  { id: 'st-054-便当盒', emoji: '🍱', name: '便当盒', category: 'food', rarity: 'uncommon' },
  { id: 'st-055-饭团子', emoji: '🍙', name: '饭团子', category: 'food', rarity: 'common' },
  { id: 'st-056-樱花瓣', emoji: '🌸', name: '樱花瓣', category: 'nature', rarity: 'common' },
  { id: 'st-057-木槿花', emoji: '🌺', name: '木槿花', category: 'nature', rarity: 'common' },
  { id: 'st-058-向日葵', emoji: '🌻', name: '向日葵', category: 'nature', rarity: 'common' },
  { id: 'st-059-郁金香', emoji: '🌷', name: '郁金香', category: 'nature', rarity: 'common' },
  { id: 'st-060-红玫瑰', emoji: '🌹', name: '红玫瑰', category: 'nature', rarity: 'common' },
  { id: 'st-061-小雏菊', emoji: '🌼', name: '小雏菊', category: 'nature', rarity: 'common' },
  { id: 'st-062-四叶草', emoji: '🍀', name: '四叶草', category: 'nature', rarity: 'uncommon' },
  { id: 'st-063-彩虹桥', emoji: '🌈', name: '彩虹桥', category: 'nature', rarity: 'uncommon' },
  { id: 'st-064-小太阳', emoji: '☀️', name: '小太阳', category: 'nature', rarity: 'common' },
  { id: 'st-065-弯弯月', emoji: '🌙', name: '弯弯月', category: 'nature', rarity: 'common' },
  { id: 'st-066-小星星', emoji: '⭐', name: '小星星', category: 'nature', rarity: 'common' },
  { id: 'st-067-亮晶晶', emoji: '✨', name: '亮晶晶', category: 'nature', rarity: 'common' },
  { id: 'st-068-软绵绵', emoji: '☁️', name: '软绵绵', category: 'nature', rarity: 'common' },
  { id: 'st-069-雪花片', emoji: '❄️', name: '雪花片', category: 'nature', rarity: 'common' },
  { id: 'st-070-浪花朵', emoji: '🌊', name: '浪花朵', category: 'nature', rarity: 'common' },
  { id: 'st-071-椰子树', emoji: '🌴', name: '椰子树', category: 'nature', rarity: 'common' },
  { id: 'st-072-红蘑菇', emoji: '🍄', name: '红蘑菇', category: 'nature', rarity: 'common' },
  { id: 'st-073-仙人掌', emoji: '🌵', name: '仙人掌', category: 'nature', rarity: 'uncommon' },
  { id: 'st-074-小盆栽', emoji: '🪴', name: '小盆栽', category: 'nature', rarity: 'common' },
  { id: 'st-075-枫叶红', emoji: '🍁', name: '枫叶红', category: 'nature', rarity: 'common' },
  { id: 'st-076-稻穗儿', emoji: '🌾', name: '稻穗儿', category: 'nature', rarity: 'common' },
  { id: 'st-077-风铃草', emoji: '🪻', name: '风铃草', category: 'nature', rarity: 'uncommon' },
  { id: 'st-078-蝴蝶结', emoji: '🎀', name: '蝴蝶结', category: 'cute', rarity: 'common' },
  { id: 'st-079-气球球', emoji: '🎈', name: '气球球', category: 'cute', rarity: 'common' },
  { id: 'st-080-礼物盒', emoji: '🎁', name: '礼物盒', category: 'cute', rarity: 'common' },
  { id: 'st-081-泰迪熊', emoji: '🧸', name: '泰迪熊', category: 'cute', rarity: 'common' },
  { id: 'st-082-套娃娃', emoji: '🪆', name: '套娃娃', category: 'cute', rarity: 'uncommon' },
  { id: 'st-083-旋转马', emoji: '🎠', name: '旋转马', category: 'cute', rarity: 'uncommon' },
  { id: 'st-084-摩天轮', emoji: '🎡', name: '摩天轮', category: 'cute', rarity: 'rare' },
  { id: 'st-085-过山车', emoji: '🎢', name: '过山车', category: 'cute', rarity: 'uncommon' },
  { id: 'st-086-滑滑鞋', emoji: '🛼', name: '滑滑鞋', category: 'cute', rarity: 'common' },
  { id: 'st-087-风筝飞', emoji: '🪁', name: '风筝飞', category: 'cute', rarity: 'common' },
  { id: 'st-088-调色盘', emoji: '🎨', name: '调色盘', category: 'cute', rarity: 'common' },
  { id: 'st-089-小铅笔', emoji: '✏️', name: '小铅笔', category: 'cute', rarity: 'common' },
  { id: 'st-090-故事书', emoji: '📚', name: '故事书', category: 'cute', rarity: 'common' },
  { id: 'st-091-音符儿', emoji: '🎵', name: '音符儿', category: 'cute', rarity: 'common' },
  { id: 'st-092-小钢琴', emoji: '🎹', name: '小钢琴', category: 'cute', rarity: 'uncommon' },
  { id: 'st-093-小吉他', emoji: '🎸', name: '小吉他', category: 'cute', rarity: 'uncommon' },
  { id: 'st-094-小皇冠', emoji: '👑', name: '小皇冠', category: 'cute', rarity: 'rare' },
  { id: 'st-095-亮宝石', emoji: '💎', name: '亮宝石', category: 'cute', rarity: 'uncommon' },
  { id: 'st-096-水晶球', emoji: '🔮', name: '水晶球', category: 'cute', rarity: 'rare' },
  { id: 'st-097-魔法棒', emoji: '🪄', name: '魔法棒', category: 'cute', rarity: 'uncommon' },
  { id: 'st-098-马戏团', emoji: '🎪', name: '马戏团', category: 'cute', rarity: 'rare' },
  { id: 'st-099-飞碟碟', emoji: '🛸', name: '飞碟碟', category: 'cute', rarity: 'rare' },
  { id: 'st-100-小火箭', emoji: '🚀', name: '小火箭', category: 'cute', rarity: 'uncommon' },
  { id: 'st-101-靶心靶', emoji: '🎯', name: '靶心靶', category: 'cute', rarity: 'common' },
  { id: 'st-102-粉爱心', emoji: '💖', name: '粉爱心', category: 'star', rarity: 'common' },
  { id: 'st-103-双爱心', emoji: '💕', name: '双爱心', category: 'star', rarity: 'common' },
  { id: 'st-104-跳动心', emoji: '💗', name: '跳动心', category: 'star', rarity: 'common' },
  { id: 'st-105-礼物心', emoji: '💝', name: '礼物心', category: 'star', rarity: 'uncommon' },
  { id: 'st-106-小晕晕', emoji: '💫', name: '小晕晕', category: 'star', rarity: 'common' },
  { id: 'st-107-大星星', emoji: '🌟', name: '大星星', category: 'star', rarity: 'common' },
  { id: 'st-108-闪星星', emoji: '⭐️', name: '闪星星', category: 'star', rarity: 'common' },
  { id: 'st-109-流星语', emoji: '🌠', name: '流星语', category: 'star', rarity: 'rare' },
  { id: 'st-110-黄心心', emoji: '💛', name: '黄心心', category: 'star', rarity: 'common' },
  { id: 'st-111-绿心心', emoji: '💚', name: '绿心心', category: 'star', rarity: 'common' },
  { id: 'st-112-蓝心心', emoji: '💙', name: '蓝心心', category: 'star', rarity: 'common' },
  { id: 'st-113-紫心心', emoji: '💜', name: '紫心心', category: 'star', rarity: 'common' },
  { id: 'st-114-橙心心', emoji: '🧡', name: '橙心心', category: 'star', rarity: 'common' },
  { id: 'st-115-白心心', emoji: '🤍', name: '白心心', category: 'star', rarity: 'common' },
  { id: 'st-116-转圈圈', emoji: '💞', name: '转圈圈', category: 'star', rarity: 'uncommon' },
  { id: 'st-117-丘比特', emoji: '💘', name: '丘比特', category: 'star', rarity: 'uncommon' },
  { id: 'st-118-烟花秀', emoji: '🎇', name: '烟花秀', category: 'star', rarity: 'rare' },
  { id: 'st-119-大烟花', emoji: '🎆', name: '大烟花', category: 'star', rarity: 'rare' },
  { id: 'st-120-小仙子', emoji: '🧚', name: '小仙子', category: 'fantasy', rarity: 'rare' },
  { id: 'st-121-美人鱼', emoji: '🧜', name: '美人鱼', category: 'fantasy', rarity: 'rare' },
  { id: 'st-122-中国龙', emoji: '🐉', name: '中国龙', category: 'fantasy', rarity: 'rare' },
  { id: 'st-123-小恐龙', emoji: '🦕', name: '小恐龙', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-124-大恐龙', emoji: '🦖', name: '大恐龙', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-125-小幽灵', emoji: '👻', name: '小幽灵', category: 'fantasy', rarity: 'common' },
  { id: 'st-126-南瓜灯', emoji: '🎃', name: '南瓜灯', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-127-魔法师', emoji: '🧙', name: '魔法师', category: 'fantasy', rarity: 'rare' },
  { id: 'st-128-小精灵', emoji: '🧝', name: '小精灵', category: 'fantasy', rarity: 'rare' },
  { id: 'st-129-面具侠', emoji: '🎭', name: '面具侠', category: 'fantasy', rarity: 'common' },
  { id: 'st-130-公主城', emoji: '🏰', name: '公主城', category: 'fantasy', rarity: 'rare' },
  { id: 'st-131-藏宝图', emoji: '🗺️', name: '藏宝图', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-132-小宝剑', emoji: '⚔️', name: '小宝剑', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-133-小盾牌', emoji: '🛡️', name: '小盾牌', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-134-奖杯杯', emoji: '🏆', name: '奖杯杯', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-135-金牌牌', emoji: '🥇', name: '金牌牌', category: 'fantasy', rarity: 'uncommon' },
  { id: 'st-136-勋章章', emoji: '🎖️', name: '勋章章', category: 'fantasy', rarity: 'common' },
  { id: 'st-137-银河系', emoji: '🌌', name: '银河系', category: 'fantasy', rarity: 'rare' },
  { id: 'st-138-土星环', emoji: '🪐', name: '土星环', category: 'fantasy', rarity: 'rare' },
  { id: 'st-139-彗星啦', emoji: '☄️', name: '彗星啦', category: 'fantasy', rarity: 'rare' },
];
