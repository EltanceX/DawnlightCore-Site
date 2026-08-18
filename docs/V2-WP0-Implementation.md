# V2-WP0：V2.0 决策冻结与第一批实现

状态：已完成范围冻结，已开始静态开发工具与只读目录实现

日期：2026-08-18

## 已完成

- 创建 [V2 决策登记](./V2-WP0-DecisionRegister.md)；
- 冻结 V2.0 先做工具和只读目录、V2.1 再做邀请制发布的顺序；
- 确认当前页面只能消费 Preview contract 快照，不能声称真实 Loader 通过；
- 确认目录第一批只展示 metadata-only contract candidate，不提供虚构下载；
- 保留 V1 Preview SEO、空 release feed 和 production gate 的边界。
- 新增 `/tools/`、`/tools/diagnostics/`、`/tools/catalog/`、`/tools/capabilities/`、`/tools/pipeline/` 和 `/tools/variants/` 静态路由；
- 新增 `/shaders/` 和 `/shaders/dawnlight-v3-1/` 只读目录路由；
- 将 Catalog、diagnostics、capabilities 和目录 candidate 适配为可复用 TypeScript data service；
- 增加工具/目录导航、Footer 入口、sitemap 路由和静态 smoke 检查；
- 增加工具/目录 E2E 关键路径和 axe 回归。
- 静态输出总预算因新增 V2.0 路由从 12 MiB 调整为 14 MiB；单文件预算和失败门禁保持不变。
- 已完成 [V2-WP1 动态工程骨架](./V2-WP1-Implementation.md) 和 [V2-WP2 Contract ingest 数据层](./V2-WP2-Implementation.md)。

## 当前实现边界

本批代码先将 contract 快照适配为纯 TypeScript data service，并提供可静态构建的工具/目录页面。它是 V2.0 的 UI 和数据层 Spike，不代表 NestJS API、PostgreSQL、OIDC、上传 Worker 或公开社区已经完成。Pipeline Graph 和 Variant Explorer 目前只展示接入条件，因为当前 contract 没有 graph dump 或真实 CLI explain 输出。

## 下一步

1. 完成 WP3 的 API 优先工具页、版本切换、筛选和深链；
2. 用 PostgreSQL/MinIO 环境执行真实 migration、contract ingest 和 staging smoke；
3. 为项目、版本、artifact 和 compatibility 建立维护者 seed/import；
4. 在稳定 CLI JSON contract 出现后接入 graph dump、variant explain 和真实 Loader 结果。
