# DawnlightCore V1 当前进度

状态：Preview 开发者门户工程完成；Production V1 尚未发布

更新时间：2026-08-17

## 一句话结论

V1 的静态开发者门户、Preview contract、文档平台、搜索、下载选择 UI、质量门禁和部署 artifact 已经可以运行。正式上线所需的真实 release、稳定 Core/CLI 合同、域名、品牌/实机资产、镜像、监控和回滚演练尚未完成。

## 工作包状态

| 工作包 | 当前状态 | 说明 |
| --- | --- | --- |
| WP0 决策与资产 | Preview 盘点完成，生产门禁开放 | 域名、artifact、Hero、Logo 授权、镜像、稳定 contract 未冻结 |
| WP1 工程基础 | 完成 | Next/Fumadocs static export、Node/pnpm 固定、静态 smoke |
| WP2 Design token/Shell | 完成 | Light/Dark、导航、Footer、移动菜单、焦点和基础 UI |
| WP3 Developer Contract | Preview 完成 | Schema、Catalog、diagnostics、examples 和 lock 已校验；不是稳定 ABI |
| WP4 文档平台/搜索 | 完成 | frontmatter、Fumadocs、Orama 静态索引和搜索回归 |
| WP5 首发内容 | Preview 内容完成 | 31 个首发 slug；新增格式边界、包型对比、CLI 验证记录；真实 CLI 和人工审核仍待 |
| WP6 Release/下载 | Preview UI 完成 | Release Feed v1 有 schema 和选择逻辑，但当前 `releases` 为空 |
| WP7 首页/SEO/错误页 | Preview 完成 | 概念 Hero、Preview SEO、sitemap/robots/404 已实现 |
| WP8 质量/安全/部署 | 工程完成 | check、E2E、axe、Lighthouse、预算、安全扫描、artifact、smoke、CI 已实现 |

## V1 DoD 统计

按 `DawnlightCoreWebsiteV1ImplementationPlan.md` 第 38 节的 40 条验收项，以仓库证据保守统计：

| 状态 | 数量 | 含义 |
| --- | ---: | --- |
| 完全满足 | 18 | 已有实现和验证证据 |
| 部分满足 | 16 | 只有 Preview、缺少生产环境或缺少人工/自动化证据 |
| 未完成 | 6 | 要求本身尚不存在 |

因此当前有 `22` 条验收项尚未达到“完全满足”。这不是说 22 个功能都缺失，其中很多是生产资产、人工审核或上线运维证据。

## 已补齐的文档主题

- JSON、GLSL 与 C# runtime 的职责边界；
- BuiltIn Minimal 与 External Complete 的位置、能力和资源边界；
- `ShaderPackCli` 当前不可用状态；
- Core 本地构建示例与 schema/Loader 验证顺序；
- schema-only、Loader、hash、诊断和退出码的验证记录格式。

补充文档使静态搜索索引达到约 494 KiB，因此 WP8 搜索索引预算已从 400 KiB 明确调整为 512 KiB；该预算仍由 CI 硬失败保护。

新增页面：

- `apps/web/content/docs/00-overview/format-boundaries.mdx`
- `apps/web/content/docs/02-concepts/builtin-minimal-vs-external-complete.mdx`
- `apps/web/content/docs/01-getting-started/cli-installation-and-verification.mdx`

## 当前剩余项

### 内容和合同

- 发布可安装的稳定 `ShaderPackCli` 或提供稳定 CLI JSON contract；
- 用同一 Core commit 的真实 Loader 结果替换 schema-only 示例；
- 完成技术审核、编辑审核和非实现者作者试走；
- 冻结稳定 Core contract、文档版本和迁移策略。

### 发布和资产

- 添加至少一个真实、可访问、带 size/SHA-256/签名的 release artifact；
- 确认主下载源、镜像顺序和镜像监测；
- 采集并审核 Dawnlight 实机 Hero，确认 Logo/品牌资产授权；
- 冻结正式域名、部署 provider 和生产 metadata。

### 验收和运维

- 补充 360、768、1536 宽度、Light/Dark 全组合和 200% zoom 复核；
- 补充完整键盘作者/下载路径、主题闪烁和 CLS 证据；
- 在真实 host 验证 TLS、安全头、缓存、404 和 Production smoke；
- 配置 uptime/下载镜像监控、告警联系人并执行一次真实回滚演练；
- 根据真实 CSP 报告决定是否从 Report-Only 切换为 enforced。

社区、账户、API、数据库、上传、在线验证和项目投稿不属于 V1 未完成项，它们在 V1 方案中被明确列为后续阶段范围。
