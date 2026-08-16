# WP1：工程基础与静态 Spike

状态：已完成

日期：2026-08-16

## 交付内容

- 建立根 pnpm workspace，工作区包含 `apps/web`；
- 固定 `pnpm@11.19.0`，加入 Turborepo 编排入口和 Prettier 格式检查边界；
- 使用 Next.js App Router + Fumadocs MDX + Tailwind CSS；
- 采用 `output: 'export'` 和 `trailingSlash: true`，静态输出位于 `apps/web/out/`；
- 建立 `/zh-CN/`、`/zh-CN/docs/preview/`、`/zh-CN/downloads/` 路由；
- 添加一个中文版本化 MDX 页面，包含 Manifest v3 JSON 代码块；
- 保留 Fumadocs 构建期 Orama 索引，静态输出为 `out/api/search`；
- 加入站点配置、locale/version 参数校验和 Vitest 单测；
- 加入 `scripts/verify-static-output.mjs`，检查关键静态页面和搜索索引；
- 添加根 `/` 静态 fallback，链接到首发中文入口；
- 允许 `esbuild`、`@parcel/watcher` 和 `@swc/core` 构建脚本，并锁定 `style-to-js@2.0.2` 解决当前 Fumadocs/Turbopack 兼容问题。

## 已验证命令

在仓库根目录执行：

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:static
```

构建路由摘要：

```text
/
/zh-CN/
/zh-CN/docs/preview/
/zh-CN/downloads/
/api/search
```

## Spike 结论

1. Fumadocs MDX、目录、代码高亮和页面静态导出可以在当前 Node/pnpm 环境工作；
2. 版本化 locale 路由可以通过 Next.js `generateStaticParams` 枚举，不需要 middleware 或运行时重定向；
3. Orama 索引在构建期生成，静态站点不需要业务 API；
4. `trailingSlash` 生成的目录式 HTML 适配对象存储和 CDN 托管；
5. 正式发布前仍需将 `canonicalOrigin`、release feed、Hero 资产、合同快照和完整文档内容替换当前 preview 占位值。

## 已知边界

- 当前搜索 route 仍沿用 Fumadocs 的 `/api/search` 静态文件命名，目标托管 provider 需要验证无扩展名 JSON 的 MIME 和 fallback 行为；
- 只有 `zh-CN` 和 `preview`，尚未启用英文 locale 或稳定版本；
- 下载页只用于验证路由和布局，不能展示未确认的 artifact；
- 当前站点配置中的 `canonicalOrigin` 是 `.invalid` preview 值，禁止用于生产 sitemap 或分享元数据；
- `next-intl` 已纳入依赖，实际消息目录和多语言 middleware 延后到有第二个完整 locale 时接入，以保持静态导出简单。
