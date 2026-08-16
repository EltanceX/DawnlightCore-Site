# WP0 决策登记表

状态：进行中

日期：2026-08-16

上位文档：[V1 实施方案](./DawnlightCoreWebsiteV1ImplementationPlan.md)

本表是第一版实施前的唯一决策登记入口。`Frozen` 表示可以直接进入实现；`Pending` 表示仍需维护者或发行流程确认；`Blocked` 表示有证据表明当前不能安全实施。

## 决策清单

| ID | 主题 | 决策/当前值 | 状态 | 证据或下一步 |
|---|---|---|---|---|
| WP0-D01 | V1 产品范围 | 静态开发者门户 + 官方下载；无账户、社区、API、DB、上传 | Frozen | ADR-0001 |
| WP0-D02 | Web 技术 | Next.js + Fumadocs + TypeScript strict | Frozen | 总体开发文档 |
| WP0-D03 | 生产输出 | `output: export`；locale 由显式路由和宿主重定向处理 | Frozen | V1 方案第 11/13 节 |
| WP0-D04 | 文档首发 locale | 完整 `zh-CN`；未完成的 `en-US` 不发布 | Frozen | ADR-0002 |
| WP0-D05 | 文档临时版本 | `preview`；默认 noindex；正式版本再复制为不可变 ID | Frozen | ADR-0002 |
| WP0-D06 | 技术 source | GitHub `EltanceX/DawnlightCore` | Frozen | Git remote 证据 |
| WP0-D07 | 现有发行 source | Gitee `SC-SPM/SurvivalcraftApi` | Frozen | README/CHANGELOG 证据 |
| WP0-D08 | 候选 Core snapshot | commit `3ec28fc9461e6b1636ad4adc086e9cea8150c02e`；仅候选，非生产 | Frozen | 当前工作树有未提交修改，只能从 commit tree 导出 |
| WP0-D09 | 候选 shader pack | `dawnlight:dawnlight_v3_1`，Manifest v3 | Frozen | `shaderpack.json` |
| WP0-D10 | 搜索 | 构建期按 locale/version 生成 Orama 静态索引 | Frozen | 静态部署约束 |
| WP0-D11 | Release feed | `releases-v1.json`，Zod/JSON Schema 校验，canonical JSON | Frozen | `contracts/release-feed-v1.schema.json` |
| WP0-D12 | Feed 完整性 | 生产使用 detached Ed25519 signature；preview 可使用测试 key | Frozen | V1 方案签名规则 |
| WP0-D13 | 当前正式 artifact | 尚未确认 URL、size、hash、签名 | Blocked | 不得把 Debug 输出发布 |
| WP0-D14 | 网站域名 | 未提供 | Pending | 需要维护者确认 canonical origin |
| WP0-D15 | Hero 截图 | 现有两张候选均不合格；需要重新截图 | Blocked | WP0-AssetInventory |
| WP0-D16 | Logo/品牌资产 | 现有为 Survivalcraft/游戏内 UI 资产，网站使用权未确认 | Pending | WP0-AssetInventory |
| WP0-D17 | 国内/全球镜像 | provider 和主次顺序未确认 | Pending | 发布流程 ADR |
| WP0-D18 | API/社区 | 推迟到 V1 后，不在本次 workspace 初始化 | Frozen | ADR-0001 |

## WP1 开始门禁

WP1 工程 Spike 可以在 `D01-D12` 基础上开始。以下项目不阻塞本地 UI 和静态导出验证，但阻塞生产发布：

- `D13` 正式 artifact；
- `D14` canonical origin；
- `D15` 可公开 hero；
- `D16` Logo/品牌授权；
- `D17` 镜像策略。

## 需要维护者确认的最小问题

1. 首发网站使用哪个正式域名？
2. V1 是否只展示 Windows，还是同时展示现有 API 的 Android/Linux/iOS 发行包？
3. 是否允许网站使用 Survivalcraft Logo、DawnlightNormal/DawnlightClicked 和游戏截图？
4. 网站技术文档是否以 `preview` 发布，还是等待一个带公共 ABI 版本的正式 Core release？
5. 主下载源优先使用 Gitee Release、GitHub Release 还是对象存储？
