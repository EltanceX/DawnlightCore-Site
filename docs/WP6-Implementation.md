# WP6：Release Feed 与下载体验

状态：已完成（Preview feed，正式 artifact 待资产冻结）

日期：2026-08-17

## 交付内容

- 建立 `content/releases/releases.json` 作为 Release Feed v1 编辑源；
- 建立 `apps/web/public/feeds/releases-v1.json` 静态公开 feed；
- 建立 `scripts/generate-release-feed.mjs`，按受控 `generatedAt` 和发布时间稳定排序生成 feed；
- 建立 `scripts/validate-releases.mjs`，校验 source/generated 一致性、schemaVersion、时间、ID、release notes、artifact size、SHA-256、HTTPS、镜像重复和 host allow-list；
- 建立 `apps/web/src/lib/releases.ts`，使用 Zod 定义 Release/Artifact/Location 类型和 feed parser；
- 建立 `recommendArtifact` 纯函数，支持 channel、platform、architecture、variant 选择，排除 withdrawn/archived，返回 reason、alternatives 和 compatibility state；
- 下载页接入平台建议、URL query 优先、localStorage 偏好、channel/platform/architecture 控件、artifact metadata、SHA-256 复制和主源/镜像扩展点；
- 发布记录页接入同一 feed，按发布时间排序，并保留 withdrawn/archived 的未来展示能力；
- 新增 release feed 单元测试，覆盖空 feed、精确匹配和不兼容选择；
- 静态 smoke 检查下载页、发布记录页、feed 文件和 preview 空状态。

## 当前 Preview 边界

WP0 尚未冻结正式 artifact 文件、SHA-256、签名和镜像 URL，因此当前 source feed 的 `releases` 为空。下载页面不会伪造 GitHub/Gitee 下载包，也不会把源码仓库链接当成安装 artifact；它会明确显示“尚无可下载 artifact”。

批准的未来下载 host 当前只有 `github.com` 和 `gitee.com`，记录于 `content/releases/allowed-hosts.json`。接入 R2、COS、OSS 或 CDN 前必须先更新 allow-list、hash 记录和部署 ADR。

当前没有动态发布详情路由，因为静态导出不允许空 `generateStaticParams`；真实 release 接入时，详情页应与 release notes 文件、artifact 列表和回滚说明一起启用，不生成虚假占位版本。

## 数据流

```text
content/releases/releases.json
        -> releases:generate
apps/web/public/feeds/releases-v1.json
        -> apps/web/src/lib/releases.ts (Zod parse)
        -> 下载页 / 发布记录页 / 未来客户端
```

页面、首页和机器 feed 都消费同一份 parsed domain model，不手写额外版本字符串。Artifact 下载直接使用 HTTPS location URL，网站不代理大文件。

## 接入真实 Release 的步骤

1. 把 release notes 写入 `content/releases/notes/*.md`；
2. 在 source feed 添加版本、channel、Core API、Manifest、docsVersion 和 artifacts；
3. 为每个 artifact 填写不可变文件名、字节数、小写 SHA-256、Graphics API、primary 和 mirrors；
4. 确认所有 URL host 已在 allow-list，镜像 hash 与主源一致；
5. 运行 `pnpm releases:generate` 和 `pnpm validate:releases`；
6. 运行完整静态构建并人工核对下载按钮目标、hash 和发布记录。

生产环境还需要 detached Ed25519 feed signature；签名密钥不能进入仓库或 Next.js 客户端 bundle。当前 preview feed 未声明 `signingKeyId`。

## 验证命令

```text
pnpm releases:generate
pnpm validate:releases
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:contract
pnpm validate:content
pnpm build
pnpm verify:static
```
