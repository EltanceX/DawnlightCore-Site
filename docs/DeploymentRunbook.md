# DawnlightCore V1 部署运行手册

状态：Preview 可执行；Production 需先关闭 WP0 门禁

日期：2026-08-17

## 1. 部署原则

- `apps/web/out/` 是唯一可部署 artifact；
- artifact 必须来自已通过质量门禁的 commit，禁止线上手工改文件；
- Preview 和 Production 使用相同构建链路，但环境变量、robots、安全头和门禁不同；
- 上传完成并通过 smoke 后才切换流量；
- 回滚始终切换到上一个完整 artifact，不做局部覆盖；
- 安装包由批准的 HTTPS 下载 host 提供，网站不代理大文件。

## 2. 环境要求

```text
Node.js 26.7.0
pnpm 11.19.0
```

本地从 `.env.example` 创建未纳入版本控制的环境配置。Production 必需值：

```text
NEXT_PUBLIC_SITE_MODE=production
NEXT_PUBLIC_SITE_ORIGIN=https://<正式域名>
DEPLOY_PROVIDER=<已批准 provider ID>
PRODUCTION_DOCS_VERSION=<非 preview 的稳定文档版本>
```

部署凭据只能进入 provider/GitHub environment secret。任何秘密都不能使用 `NEXT_PUBLIC_` 前缀。

## 3. Preview 构建与验证

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm deploy:prepare:preview
pnpm --filter @dawnlight/web start:test
```

另一个终端执行：

```powershell
pnpm smoke:deploy -- --origin http://127.0.0.1:4173 --mode preview
```

检查 `reports/deploy-manifest.json` 的 commit、mode、origin、文件数和 SHA-256 清单。Preview 可以是 docs-only 且 release feed 为空，但必须保留 Preview 披露、`noindex` 和 `.invalid` canonical 防护。

## 4. Production 发布前检查

先在已设置 Production 环境变量的 shell 中执行：

```powershell
pnpm deploy:validate:production
```

任何 gate 失败都应停止发布，不能用占位域名、伪造 release、临时 hash 或概念 Hero 绕过。Gate 通过后执行：

```powershell
pnpm check
pnpm deploy:prepare:production
```

发布负责人还必须人工核对：

- 站点名称、版本、release notes 和兼容性；
- 每个 artifact 的实际字节数、SHA-256、签名和镜像；
- canonical、robots、sitemap 和 OG 图片使用正式 origin；
- Hero 是有来源记录的 Dawnlight 实机图；
- 当前 artifact 和上一个可回滚 artifact 均已保存；
- 变更窗口、负责人、告警接收方和回滚决策人已记录。

## 5. 上传与流量切换

GitHub Actions 的 `Deploy Production` 是手动入口，并要求 `production` environment 审批。当前工作流包含 Cloudflare Pages 参考适配器；若最终 provider 不同，应替换上传命令，但保持以下顺序：

```text
production gate -> full quality check -> prepare immutable artifact
-> upload under commit identity -> smoke deployment URL
-> verify headers/cache/TLS -> switch production traffic
```

Cloudflare 参考配置使用：

```text
vars.CLOUDFLARE_PAGES_PROJECT
vars.PRODUCTION_DOCS_VERSION
secrets.CLOUDFLARE_API_TOKEN
secrets.CLOUDFLARE_ACCOUNT_ID
```

正式 provider 必须消费 `out/_headers` 或把等价规则翻译到自身配置。不能因为 provider 不识别该文件就省略安全头。

## 6. 部署后 smoke

```powershell
$env:SMOKE_ORIGIN = "https://<部署 URL>"
$env:EXPECT_DEPLOY_HEADERS = "1"
pnpm smoke:deploy -- --mode production
```

Smoke 覆盖根页、中文首页、Preview 文档入口、下载页、release feed、robots、sitemap、Hero 和 404，并验证基础安全头；Production 还要求 HSTS。

随后人工检查：

- TLS 证书、重定向和 trailing slash；
- `/_next/static/*` 为 immutable，HTML 可 revalidate，feed TTL 不超过五分钟；
- CSP Report-Only 没有阻止实际资源，控制台没有混合内容；
- 首页、搜索、文档和下载在桌面/移动端可用；
- 至少从一个目标网络验证主下载源和镜像。

## 7. 监控

正式域名冻结后配置外部监控，最低要求：

- 每 5 分钟请求 `/zh-CN/` 和 `/feeds/releases-v1.json`；
- 校验 HTTP 状态、TLS 有效期、feed JSON schemaVersion 和响应时间；
- 每次发布执行完整 smoke；
- 每周运行 Lighthouse、依赖漏洞审计和下载镜像可达性；
- 告警包含发生时间、origin、commit/artifactId、失败路径和响应状态。

当前仓库只提供 CI 定期质量审计和部署后 smoke；外部 uptime 服务与告警联系人尚待 WP0 决策，未配置前不能勾选 Production 上线清单。

## 8. 回滚

触发条件包括核心路由失败、错误 artifact/hash、下载指向错误、严重可访问性回归、安全头丢失或持续性能退化。

1. 停止继续发布并记录当前 `artifactId`；
2. 在 provider 将流量切回上一个已验证的完整 artifact；
3. 对回滚 URL 运行 Production smoke；
4. 若 feed 发布错误，确认 CDN 五分钟 TTL 后再次验证；
5. 记录影响范围、开始/恢复时间和回滚 commit；
6. 修复必须重新走完整门禁，不在线修改旧 artifact。

若错误涉及恶意或错误下载，应先撤下对应 location 或发布 `withdrawn` feed 更新，再处理网站 UI；不得保留已知有害 artifact 只等待下一次常规发布。

## 9. 故障记录模板

```text
事件：
开始时间 / 恢复时间：
Production origin：
失败 artifactId / commit：
回滚 artifactId / commit：
用户影响：
检测来源：
采取动作：
smoke 结果：
负责人：
后续修复：
```
