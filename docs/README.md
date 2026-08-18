# DawnlightCore 网站文档索引

## 总体规划

- [网站整体开发文档](./DawnlightCoreWebsiteDevelopmentPlan.md)
- [V1 详细实现方案](./DawnlightCoreWebsiteV1ImplementationPlan.md)
- [V1 当前进度与剩余项](./V1-Progress.md)
- [V2 详细实现方案](./DawnlightCoreWebsiteV2ImplementationPlan.md)

## V2.0：开发工具与只读目录

- [V2-WP0 决策登记](./V2-WP0-DecisionRegister.md)
- [V2-WP0 实现记录](./V2-WP0-Implementation.md)

## WP0：决策冻结与资产盘点

- [决策登记表](./WP0-DecisionRegister.md)
- [资产盘点](./WP0-AssetInventory.md)
- [实现门禁与交接](./WP0-ImplementationGate.md)

## WP3：Developer Contract 接入

- [实现记录](./WP3-Implementation.md)

## WP4：文档平台与搜索

- [实现记录](./WP4-Implementation.md)

## WP5：首发文档内容

- 首发内容树位于 `apps/web/content/docs/00-overview` 至 `07-migration`；
- [实现记录](./WP5-Implementation.md)

## WP6：Release Feed 与下载体验

- [实现记录](./WP6-Implementation.md)

## WP7：首页、SEO 与错误页

- [实现记录](./WP7-Implementation.md)

## WP8：质量、安全与部署

- [实现记录](./WP8-Implementation.md)
- [部署运行手册](./DeploymentRunbook.md)

## ADR

- [ADR-0001：V1 范围与静态发布](./adr/0001-v1-scope-and-static-publishing.md)
- [ADR-0002：来源、版本、语言与发布策略](./adr/0002-source-version-locale-and-release-policy.md)
- [ADR-0003：静态部署与回滚契约](./adr/0003-deployment-contract.md)

## 机器合同

- `contracts/release-feed-v1.schema.json`：Release Feed v1 JSON Schema；
- `contracts/dawnlight/preview/contract-lock.json`：当前候选 Core contract lock，状态为 preview-validated；稳定 ABI 仍被阻塞；
- `contracts/README.md`：合同目录边界。
