# ADR-0003：静态部署与回滚契约

状态：已接受

日期：2026-08-17

相关文档：[WP8 实现记录](../WP8-Implementation.md)、[部署运行手册](../DeploymentRunbook.md)

## 背景

V1 已决定采用 Next.js static export，但正式域名、全球/大陆部署 provider 和真实 release 尚未冻结。如果部署实现直接绑定单一平台，后续迁移会改变构建产物、缓存语义和回滚方式；如果没有 Production gate，Preview contract、空 feed 和概念 Hero 又可能被误发为正式站点。

## 决策

1. `apps/web/out/` 是 V1 唯一部署 artifact，也是 provider 间的兼容边界；
2. 每个 artifact 对应一个完整 commit，包含 `_headers` 和 `deploy-manifest.json`，禁止局部覆盖；
3. manifest 记录所有文件的相对路径、字节数和 SHA-256，并声明回滚到上一个完整 artifact；
4. provider 负责实现 `_headers` 中等价的安全头、缓存和 404 行为；
5. HTML 可 revalidate，hash 静态资源 immutable，媒体七天，release feed 五分钟；
6. Preview 使用 `noindex`，Production 使用 HTTPS、HSTS、可索引 metadata 和更严格的发布门禁；
7. CSP 先以 Report-Only 部署，收集真实报告后另行决定 enforced 策略；
8. 部署后 smoke 是切换 Production 流量的前置条件；
9. Cloudflare Pages 仅是工作流中的参考适配器，不构成 provider 冻结决策。

## Production gate

Production artifact 只有在正式 HTTPS origin、显式 provider、稳定文档版本、至少一个可用 release，以及 Production eligible Hero 同时存在时才允许生成。Gate 不提供跳过参数；紧急发布仍需满足数据真实性和安全要求。

## 影响

- 同一 artifact 可迁移到 Cloudflare Pages、对象存储/CDN、Netlify 或其他静态 host；
- provider 配置必须接受契约测试，不能只验证上传成功；
- release feed 的短缓存允许撤回传播，代价是比 hash 静态资源更频繁 revalidate；
- 当前 Preview 能生成和验证 artifact，但 Production workflow 会在前置资产缺失时停止；
- provider 原生 atomic deploy/version rollback 应优先使用，没有该能力的 provider 不适合作为正式目标。

## 后续决策

正式 provider、域名、部署区域、外部监控服务、告警负责人和 CSP enforced 方案仍需独立冻结。它们可以扩展本 ADR，但不得改变完整 artifact 和可验证回滚原则。
