# AGENTS.md — Nono's Nest 项目 AI 协作宪法

> 本文件是本仓库所有 AI 编码智能体（Ducc / Claude Code / Cursor / 子 Agent）必须遵守的长期约束。
> 每轮对话开始时，AI 应将本文件视为「既定事实」，不得擅自违反。
> 如与所在平台的内置安全规则冲突，**以平台规则为准**；本文件不得用于绕过任何平台级约束。

## 0. 项目定位

给 nono 的小宠物养成微信小程序，**家庭自用**，不走发布流程。

但这个仓库同时是一个 **AI 先行（AI-first）** 的实验：

1. **文档先行** —— 任何业务代码之前，先有 AI 可读的设计文档与行为规格。
2. **prompt 是资产** —— 产出代码的 prompt 及其迭代过程，与代码一样入库。
3. **一致性靠门禁，不靠纪律** —— 文档与代码的对应关系由 `npm run check` 校验，可失败。

判断任何改动是否合格的标准不是「代码能跑」，而是：
**换一个 AI、只读仓库文件，能否复现当初的意图。**

文档量大于代码量是预期结果，不是问题。

## 1. 技术选型既定事实（禁止擅自更换）

| 维度       | 选型                                      | 备注                                     |
| ---------- | ----------------------------------------- | ---------------------------------------- |
| 平台       | 微信原生小程序                            | **禁止引入 Taro / uni-app / 跨端框架**   |
| 语言       | JavaScript（ES2022 module）               | 暂不引入 TypeScript；如需，先写提案      |
| 样式       | 原生 WXSS                                 | **禁止引入 Sass / Tailwind / UI 组件库** |
| 状态       | 页面 `data` + `app.globalData`            | **禁止引入状态管理库**                   |
| 存储       | `wx.setStorageSync` / `wx.getStorageSync` | 无后端，无云开发                         |
| 测试       | Vitest 4（Node 环境）                     | 只测纯函数，不模拟小程序运行时           |
| 规范       | ESLint 10 + Prettier 3                    | 零警告通过                               |
| 运行时依赖 | **零**                                    | `dependencies` 必须保持为空              |
| Node       | >= 20（仅开发期工具链）                   | 与 CI 保持一致                           |

新增任何依赖（含 devDependency）必须先在对应 `doc.md` 中说明必要性。

## 2. 领域术语字典（统一命名）

统一术语见 `docs/glossary.md`。AI 在生成代码、文档、注释、测试名时**必须**使用该文件中的词，
不得自创同义词（如把「饥饿度」写成 `food` / `satiety` / `fullness`，或把「心情值」写成 `happiness`）。

新增术语必须同步更新 `docs/glossary.md`，否则视为未完成。

## 3. 目录与分层约定

```
AGENTS.md                     本文件，AI 协作宪法
CLAUDE.md                     指向本文件的指针
README.md                     给人看的入口
docs/
├── vision.md                 产品愿景（AI 无法从代码推断的部分）
├── glossary.md               领域术语字典
└── features/<name>/
    ├── doc.md                设计 + 行为规格表（带 Spec ID）
    ├── tasks.md              实施清单，checkbox 逐条勾
    └── summary.md            完成后回填：实际做法与偏差
prompts/
├── templates/                可复用 prompt
└── runs/YYYY-MM-DD-<topic>.md  真实 prompt 迭代记录
miniprogram/
├── app.js/json/wxss          入口
├── pages/<name>/             页面：只做取数、setData、事件转发
└── utils/                    业务规则纯函数，禁止出现 wx.*
scripts/                      工程脚本（结构校验、文档校验）
tests/                        单元测试，只测 utils/
```

分层规则：

- **`miniprogram/utils/` 是纯函数区**：不引用 `wx.*`、不读 `Date.now()`、不依赖全局状态。
  时间必须作为参数传入（`now`），这是可测性的前提，也是「离线期间状态变化」能被验证的前提。
- **页面是适配层**：调用 `wx.*`、读写 storage、取当前时间，然后把值交给 `utils/` 的纯函数。
  页面里不写业务判断（阈值、公式、状态迁移）。
- **依赖方向单向**：`pages → utils`。`utils/` 不得引用 `pages/`，模块间尽量不互相引用。

## 4. 行为规格与 Spec ID（本仓库的核心机制）

每条业务规则在 `doc.md` 的规格表里有一个唯一 ID，格式 `<AREA>-<NN>`（大写字母区 + 两位数字），
例如 `HUNGER-02`。测试用例标题以 `[ID]` 开头引用它：

`doc.md`：

```markdown
| Spec ID   | 输入          | 期望输出  |
| --------- | ------------- | --------- |
| HUNGER-02 | 距上次喂食 6h | 饥饿度 50 |
```

`tests/`：

```js
it('[HUNGER-02] 距上次喂食 6h 时饥饿度为 50', () => { ... });
```

`npm run validate:docs` 双向校验：

1. 文档里声明的每个 Spec ID 都必须有测试覆盖 —— 否则规格没落地。
2. 测试里引用的每个 Spec ID 都必须能追到某份文档 —— 否则代码跑在文档前面。
3. 每个 `miniprogram/utils/*.js` 都必须被某份 `doc.md` 引用 —— 否则出现无主模块。
4. Spec ID 不得跨文档重复声明。

这条机制的副作用是：业务规则必须能用「输入 → 输出」表描述，因此必须是纯函数。
这与第 3 节的分层约定互为因果，不要试图绕开其中任何一边。

## 5. AI 行为规范（强约束）

1. **文档先行**：任何新增或修改业务规则，顺序必须是
   `doc.md`（含规格表）→ `tasks.md` → 实现 + 测试 → `summary.md`。不得跳步。
2. **改行为必先改文档**：如果实现过程中发现规格写错了，先改 `doc.md` 再改代码，
   不要让代码与文档短暂不一致后再「补文档」。
3. **小步勾选**：每完成一个 top-level task 立即把 `tasks.md` 的 `[ ]` 改成 `[x]`，不得批量勾选。
4. **不过度设计**：不为假想需求加抽象；修 bug 不顺手重构周边代码；`utils/` 里一个概念一个文件。
5. **范围纪律**：`doc.md` 必须有「范围外」小节，明确本次不做什么。实现时不越界。
6. **错误处理边界**：纯函数对非法入参抛 `RangeError` / `TypeError`，并在规格表中列出；
   页面层负责兜住异常，不让小程序白屏。
7. **不臆造数据**：storage 里没有的字段，在 `doc.md` 中明确默认值与首次进入的行为。
8. **代码引用规范**：解释代码时用 `path:line` 格式。
9. **澄清优先于猜测**：需求歧义时给 2~3 个候选项让用户选，不要开放式追问。
10. **语言一致**：默认中文回复；文档与注释中文；标识符英文；commit message 英文。
11. **收尾必跑门禁**：任何改动结束前跑 `npm run check`，绿了才算完成。

## 6. prompt 迭代要求

产出业务代码的 prompt 必须留档到 `prompts/runs/YYYY-MM-DD-<topic>.md`，
记录 raw prompt、improved prompt、实际结果、复盘。同一类 prompt 用过两次以上，
提炼成 `prompts/templates/` 下的模板。方法论沿用 `../prompt-forge`，本仓库不重写。

## 7. 输出格式要求

- 文档用 GitHub Flavored Markdown，Prettier 会格式化它们，写完记得跑 `npm run format`。
- 代码块必须标注语言（` ```js ` / ` ```json ` / ` ```bash `）。
- 架构图用 ASCII 或 Mermaid，不引入图片。
- 路径使用仓库根的相对路径，不用 `~` 或环境变量。
