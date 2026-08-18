# V2-WP0：V2.0 决策登记

状态：V2.0 范围冻结，动态生产能力尚未开启

日期：2026-08-18

## 决策摘要

V2.0 先交付开发工具和维护者确认的只读目录。V2.1 才引入邀请制上传、隔离 Loader 验证和审核发布；V2.2 是否开放社区投稿另行决策。当前工作不会伪造稳定 CLI、真实 release artifact、生产 API 或项目下载。

## 冻结决策

| ID | 决策 | 当前结论 | 后续复核 |
| --- | --- | --- | --- |
| V2-D01 | V2.0 范围 | Diagnostic/Catalog/Capability 工具 + 只读项目目录；Graph/Variant 先展示合同可用性边界 | Core 提供 graph dump/variant explain 后复核 |
| V2-D02 | 数据来源 | V2.0 使用仓库内版本化 contract 快照和维护者 seed，不接收浏览器上传 | V2.1 接入 API、PostgreSQL 和 quarantine |
| V2-D03 | API 边界 | API 预留 NestJS/Fastify + REST/OpenAPI；V2.0 页面先通过纯 TypeScript data service 保持可运行 | WP1 骨架和 WP2 ingest 完成后接入真实 API |
| V2-D04 | 合同状态 | 当前 contract 仍是 `preview-validated`，`schema-only` 不是 Loader 通过 | 稳定 CLI JSON contract 发布后升级 |
| V2-D05 | 目录状态 | 仅显示 metadata-only 的 Dawnlight v3.1 contract candidate；没有可下载 artifact | 真实 artifact、hash、签名和兼容记录齐全后开放下载 |
| V2-D06 | 搜索 | 工具页使用服务端静态数据和 URL 深链；不在 V2.0 提前部署 Meilisearch | 项目规模和 P95 超过门槛后复核 |
| V2-D07 | 权限 | V2.0 无账户写操作；所有项目数据由 seed/import 产生 | V2.1 OIDC 和资源级授权冻结 |
| V2-D08 | 生产门禁 | Preview canonical、空 release feed 和 production gate 保持现状 | V1 生产门禁关闭后复核 |

## 当前明确不做

- 不实现任意上传、公开投稿、评论、评分、收藏、关注和排行榜；
- 不把 `contract-lock.json` 推断成完整 Catalog/diagnostics 定义；
- 不用前端自行推断 Loader 的 variant 结果或兼容性；
- 不创建没有真实来源、hash、签名和许可证的下载按钮；
- 不将未安装的 NestJS、Prisma、PostgreSQL 和 Worker 依赖伪装成已运行的后端。

## WP0 退出条件

- [x] V2.0/V2.1/V2.2 范围和不做清单已写入 V2 方案；
- [x] 当前 Preview contract、CLI unavailable 和空 release feed 已明确记录；
- [x] V2.0 第一批工具和目录数据来源已冻结；
- [ ] 正式域名、稳定 CLI、真实 artifact、OIDC、对象存储和审核责任人仍待 V1/后续门禁关闭。

