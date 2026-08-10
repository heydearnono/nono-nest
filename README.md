# Nono's Nest 糯糯宠物屋

给 nono 的小宠物养成微信小程序。**AI 先行**项目：业务代码之前先有 AI 可读的设计文档，
prompt 的迭代过程本身入库，文档与代码的一致性由 CI 门禁保证。

当前状态：工程骨架 + AI 先行机制已就绪，业务功能（孵蛋、喂食、心情值）尚未实现。

## 开始

```bash
npm install
npm run check   # 格式 + 规范 + 结构 + 文档一致性 + 单测
```

用微信开发者工具打开项目根目录即可预览。`project.config.json` 里的 appid 目前是 `touristappid`（游客模式），
本地开发和真机预览都够用；填自己的 appid 请改 `project.private.config.json`，该文件已被 gitignore。

## AI 协作

AI 接手本仓库前必须先读 [AGENTS.md](AGENTS.md)，它是项目的协作宪法。必读顺序：

1. [AGENTS.md](AGENTS.md) —— 技术选型、分层约定、Spec ID 机制、行为规范
2. [docs/vision.md](docs/vision.md) —— 产品愿景，AI 无法从代码推断的部分
3. [docs/glossary.md](docs/glossary.md) —— 领域术语字典，禁止自创同义词
4. 相关的 `docs/features/<name>/doc.md`

## 目录

```
AGENTS.md             AI 协作宪法
CLAUDE.md             指向 AGENTS.md 的指针
docs/
├── vision.md         产品愿景
├── glossary.md       领域术语字典
└── features/<name>/  doc.md（设计+规格表）/ tasks.md / summary.md
prompts/
├── runs/             prompt 迭代记录
└── templates/        用过两次以上才提炼的模板
miniprogram/          小程序源码根目录
├── app.js/json/wxss  入口
├── pages/home/       首页
└── utils/            业务规则纯函数，可在 Node 下直接单测
scripts/              工程脚本
tests/                单元测试
```

## 核心约定

**业务规则一律写成纯函数放进 `miniprogram/utils/`**，不碰 `wx.*`、不读 `Date.now()`
（当前时刻由调用方传入），这样才能在 `tests/` 下直接测。需要调用小程序 API 的代码留在页面层。

**每条业务规则在 `doc.md` 里有一个 Spec ID**，测试标题以 `[ID]` 引用它：

```markdown
| GREET-02 | 6 ≤ hour < 11 | `早上好，糯糯` |
```

```js
it('[GREET-02] 6-10 点返回早上好', () => { ... });
```

`npm run validate:docs` 双向校验两者，缺一边就报错。参见 [AGENTS.md](AGENTS.md) 第 4 节。
`docs/features/greeting/` 是这套机制的最小样板。

## 命令

| 命令                    | 作用                                   |
| ----------------------- | -------------------------------------- |
| `npm run lint`          | ESLint 检查，零警告通过                |
| `npm run format`        | Prettier 格式化                        |
| `npm run validate`      | 校验 app.json 页面注册与实际文件一致   |
| `npm run validate:docs` | 校验规格表、测试、utils 模块三者对得上 |
| `npm test`              | 单元测试                               |
| `npm run check`         | 上述全部，CI 同款                      |

## 发布说明

小游戏类目需要企业账号，个人号无法选择。本项目定位是家庭自用，走本地开发 + 真机预览即可，
不依赖发布流程。
