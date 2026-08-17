# WP8：质量、安全与部署

状态：工程实现已完成；Preview artifact 可验证，Production 发布门禁保持关闭

日期：2026-08-17

相关文档：[部署运行手册](./DeploymentRunbook.md)、[ADR-0003](./adr/0003-deployment-contract.md)

## 交付结论

WP8 已建立从源码到不可变静态 artifact 的质量与部署链路：固定工具链、内容和合同校验、静态构建、体积预算、安全扫描、Playwright 关键路径、axe、Lighthouse、部署封装、HTTP smoke、CI artifact 留存，以及可选的 Cloudflare Pages 适配器。

这不等于网站已正式上线。当前正式域名、部署 provider、稳定文档版本、首个真实 release artifact 和实机 Hero 尚未冻结；`deploy:validate:production` 必须失败，防止把 Preview 内容误发为 Production。

## 质量门禁

根命令 `pnpm check` 按以下顺序执行：

```text
format -> lint -> typecheck -> unit tests
-> contract/content/release validation
-> static build -> static route verification
-> output budgets -> output security scan
-> Playwright + axe -> Lighthouse
```

主要实现：

- `playwright.config.ts`：1280×800 桌面和 390×844 移动项目；CI 使用 Chromium，Windows 本地使用 Edge；失败保留 screenshot、video 和 trace；
- `tests/e2e/critical-paths.spec.ts`：首页入口与首屏、文档搜索、空 release feed、主题持久化、404 恢复，以及首页/文档/下载/404 的 serious/critical axe 门禁；
- `config/static-budgets.json` 与 `scripts/check-static-budgets.mjs`：约束总输出、单个 JS/CSS/HTML、搜索索引和图片体积；
- `config/lighthouse-budgets.json` 与 `scripts/run-lighthouse.mjs`：使用 Lighthouse 官方 desktop config 检查首页、文档首页和下载页；
- `scripts/scan-static-output.mjs`：扫描静态输出中的 secret 形态、本机绝对路径、`file://`、source map 和危险 HTML/脚本模式。

当前静态上限：总输出 12 MiB，单 JS chunk 320 KiB，CSS/HTML 各 128 KiB，搜索索引 400 KiB，WebP 300 KiB，JPEG 400 KiB，PNG 128 KiB。

Lighthouse 的 Production 阈值为 Performance 0.90、Accessibility 0.95、Best Practices 0.95、SEO 0.95。Preview 有意输出 `noindex` 和 `Disallow: /`，Lighthouse 13 的 `is-crawlable` 会把 SEO 总分压到约 0.63，因此 Preview 单独采用 0.60 的书面例外；Production 不继承该例外。

axe 实测推动了三项页面修正：提高浅色主题弱化文字和主按钮对比度、把仓库入口 SVG 正确标记为装饰图标、使横向滚动的验证代码块可由键盘聚焦。

## 安全基线

Preview 和 Production 的 `_headers` 模板位于 `deploy/headers/`，均包含：

- `X-Content-Type-Options: nosniff`；
- `Referrer-Policy: strict-origin-when-cross-origin`；
- 最小化 `Permissions-Policy`；
- `X-Frame-Options: DENY` 与 CSP `frame-ancestors 'none'`；
- `Cross-Origin-Opener-Policy: same-origin`；
- `Content-Security-Policy-Report-Only`。

Preview 额外发送 `X-Robots-Tag: noindex, nofollow`；Production 额外发送一年 HSTS。CSP 先保持 Report-Only，因为 Next/Fumadocs 当前仍使用内联初始化脚本和样式。正式切换为 enforced CSP 前，必须在真实域名收集报告并选择 nonce/hash 策略，不能直接删除 `'unsafe-inline'` 导致主题或 hydration 失效。

静态站点不接收用户输入、不代理下载文件、不执行上传的 GLSL，也不包含服务器 secret。Cloudflare token 仅通过 GitHub environment secret 提供，禁止写入 `NEXT_PUBLIC_*`、artifact、日志或客户端 bundle。

## 部署 artifact

`pnpm deploy:prepare:preview` 会：

1. 要求 `apps/web/out/index.html` 已存在；
2. 把对应环境的 `_headers` 复制进 `out/`；
3. 对全部输出文件计算 SHA-256 和字节数；
4. 生成 `out/deploy-manifest.json` 和 `reports/deploy-manifest.json`；
5. 记录 commit、mode、origin、provider、文件清单和回滚策略。

`out/` 是唯一部署单元。禁止在 provider 上局部覆盖文件；一次部署必须对应一个完整 commit artifact。Preview 当前 provider 显示为 `unselected` 是事实状态，不应改成虚假 provider。

缓存契约：HTML 和一般路由必须 revalidate；内容 hash 的 `/_next/static/*` 使用一年 immutable；媒体使用七天；release feed 使用五分钟并 revalidate。发布撤回依赖 feed 较短 TTL，不能给 feed 配置 immutable。

## CI 与部署工作流

`.github/workflows/quality.yml` 在 PR、main push、每周定时和手动触发时执行完整质量门禁，并留存质量报告与 Preview artifact。每周任务还执行生产依赖高危漏洞审计。

PR Preview 只有同时满足以下条件才运行：同仓库 PR、配置 `CLOUDFLARE_PAGES_PROJECT`，并提供 Cloudflare account/token secrets。外部 fork 不获得 secret。部署后 smoke 会要求 provider 实际返回安全头。

`.github/workflows/deploy-production.yml` 只允许手动触发并绑定 GitHub `production` environment。Cloudflare Pages 步骤是当前的参考适配器，不代表 WP0 已选择正式 provider；选择其他 provider 时保留相同 artifact、header 和 smoke 契约，只替换部署步骤。

Production 在构建前验证：

- canonical origin 是非 `.invalid` 的 HTTPS URL；
- `NEXT_PUBLIC_SITE_MODE=production`；
- `DEPLOY_PROVIDER` 显式设置；
- `PRODUCTION_DOCS_VERSION` 不是 `preview`；
- release feed 至少有一个 `available` release；
- Hero metadata 标记 `productionEligible: true`。

## 验证记录

本地环境：Node `v26.7.0`、pnpm `11.19.0`、Windows Edge。

```text
pnpm e2e                    passed: 16 passed, 2 intentionally skipped
pnpm lighthouse             passed: 3 desktop routes
pnpm static:budget          passed
pnpm security:scan          passed
pnpm deploy:prepare:preview passed: 311-file Preview artifact
pnpm smoke:deploy -- --origin http://127.0.0.1:4173 --mode preview
                              passed: routes/feed/media/robots/sitemap/404
```

Production gate 按设计仍失败，原因是正式 origin、provider、稳定 docs version、可用 release 和 Production Hero 均未冻结。完整 `pnpm check` 的最终复验记录应以本提交最后一次 CI/本地运行结果为准。

## 尚未关闭的上线项

1. WP0 冻结正式域名、provider、部署区域、负责人和故障联系人；
2. 冻结非 Preview 文档版本和真实 release artifact，复核 URL、size、SHA-256 与签名；
3. 用 Dawnlight 实机图替换概念 Hero，并把审计后的 metadata 标记为 Production eligible；
4. 在正式 host 验证 `_headers`、HTTPS、HSTS、缓存和 404 行为；
5. 配置外部 uptime/合成监控和告警接收方；
6. 保存前一个完整 artifact，完成一次真实回滚演练；
7. 审阅 CSP 报告后再决定从 Report-Only 迁移到 enforced。
