# WP7：首页、SEO 与错误页

状态：已完成（Preview 门户；正式域名和实机 Hero 门禁仍未关闭）

日期：2026-08-17

## 交付内容

- 首页消费 `releaseFeed` 和 `developerContract`，不再重复手写当前 release、Core commit 或 artifact 数量；
- 首页增加开发者路径、能力边界和条件式最新发布区；没有 release 时明确显示 docs-only preview，不伪造下载 artifact；
- 接入 `apps/web/public/media/hero/` 中的宽屏/移动端 Preview Hero，通过 CSS `image-set()` 优先 WebP、回退 JPEG；
- Hero 使用全宽背景、响应式 art-direction、文案遮罩和移动端独立构图，明确显示“非 Dawnlight 实机截图”；
- 扩展根 metadata、首页/下载/发布页 metadata，以及静态 `opengraph-image`；
- 为 Next 16 静态导出 metadata routes 添加 `dynamic = "force-static"`；
- 新增 `robots.txt`、`sitemap.xml` 和根级 404 页面；Preview 模式 robots 禁止抓取，sitemap 输出空集合，不传播 `.invalid` preview URL；
- 404 提供首页、文档和下载恢复入口，并保持无 JavaScript 时可用的普通链接；
- 保留代码化品牌标记，不复制未确认授权的 Survivalcraft Logo/icon。

## 页面边界

当前站点仍是静态 Preview developer portal：

- `siteConfig.previewMode` 为 `true`；
- 文档版本仍为 `preview`，contract 状态仍为 preview-only；
- `canonicalOrigin` 仍是 `.invalid` 占位域名，不能用于生产分享或搜索索引；
- release feed 当前为空，首页和下载页不会生成虚假安装包、hash、签名或镜像；
- Hero 图片是原创 AI 概念渲染，不代表 Dawnlight runtime 输出；正式上线前必须替换为记录 Core、API、shader pack、场景和设置的实机截图。

## 关键文件

```text
apps/web/src/app/[locale]/(home)/page.tsx  # 首页内容和 domain model 消费
apps/web/src/app/global.css                 # Hero、状态栏、能力区和 404 样式
apps/web/src/app/layout.tsx                 # 根 metadata、robots、OG/Twitter
apps/web/src/app/opengraph-image.tsx        # 静态 OG 图片路由
apps/web/src/app/robots.ts                  # Preview 抓取策略
apps/web/src/app/sitemap.ts                 # Preview 空 sitemap / 生产路由生成入口
apps/web/src/app/not-found.tsx              # 根 404
apps/web/public/media/hero/                 # WebP/JPEG 发布衍生图
assets/media/source/hero/                   # 原图和 asset-metadata.yml
```

## 静态导出行为

- `next build` 在 `output: export` 下生成 102 个静态页面；
- `/opengraph-image`、`/robots.txt` 和 `/sitemap.xml` 均显式声明 `force-static`，兼容 Next 16；
- Preview 的 sitemap 为空 XML 集合，robots 使用 `Disallow: /`；切换到正式模式后 sitemap 才从内容树和 release feed 生成公开路由；
- Hero 图片直接从 `public/media/hero` 复制到 `out/media/hero`，不依赖 Next 在线 optimizer；
- 核心首页、文档、下载和 404 链接均是静态 HTML 链接。

## 验证记录

使用 Node `v26.7.0`、pnpm `11.19.0`：

```text
pnpm format:check       passed
pnpm lint               passed
pnpm typecheck          passed
pnpm test               7 tests passed
pnpm build              passed (102 static pages)
pnpm verify:static      passed
pnpm validate:content   passed (30 MDX pages / 30 routes)
pnpm validate:releases  passed (0 releases)
pnpm validate:contract  passed (14 locked files)
```

浏览器复核覆盖默认桌面视口和 390×844 移动视口：

- Hero 背景、遮罩和 Preview 披露文本可见；
- 两个主入口保持可用且不重叠；
- 移动端无横向页面溢出，Hero 后状态栏在首屏可见；
- 不存在路由显示 404 标题、文档入口和下载入口。

## 后续门禁

1. 将 `canonicalOrigin` 替换为已确认域名，并重新决定 Preview 文档是否允许索引；
2. 用真实 Dawnlight 运行截图替换概念 Hero，保留 capture metadata 和授权记录；
3. 补齐 AVIF 与内容 hash 文件名的正式图片流水线；
4. 冻结至少一个带签名和 hash 的官方 artifact 后，再开放稳定下载 CTA；
5. 在 WP8 加入 Playwright/axe 回归、链接检查、图片体积预算和生产域名 smoke。
