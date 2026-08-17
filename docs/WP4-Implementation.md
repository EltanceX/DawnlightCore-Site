# WP4：文档平台与搜索

状态：已完成

日期：2026-08-17

## 交付内容

- 扩展 Fumadocs page frontmatter schema，支持 `coreVersion`、`manifestVersion`、`settingsSchemaVersion`、`status`、`lastVerifiedWith`、`sourceRefs` 和 `searchAliases`；
- 增加 `content/docs/meta.json`，冻结当前文档树顺序与“开发文档”目录标签；
- 保留 Fumadocs DocsLayout 的三栏能力：桌面侧栏、正文、TOC；移动端继续使用内置抽屉与焦点管理；
- 使用 Fumadocs 内置面包屑、标题 anchor、代码高亮、Markdown 复制、View options 和上一页/下一页 footer；
- 新增 `DocsContractMeta`，在每篇文档标题前显示 Preview/Experimental/Stable/Deprecated 状态、Core、Manifest、Settings UI 和验证 commit；
- 新增 `pipeline/overview.mdx` 作为 WP4 长内容 fixture，覆盖中文词“设置菜单”、英文 ID `drawbuffers`/`historyCommit`、诊断码 `P9UI203`、JSON 与 GLSL 代码块、内部链接和 sourceRef；
- Orama/ZBSearch 静态索引改用 `multilingual` tokenizer，frontmatter `searchAliases` 会以结构化内容进入索引；
- `validate-docs.mjs` 校验 frontmatter、版本验证 commit、sourceRefs、绝对本机路径、绝对/相对内部链接和重复 slug；
- `verify-static-output.mjs` 增加搜索回归词和文档合同状态检查；
- 根命令增加 `pnpm validate:content`，并纳入 `pnpm check`。

## 文档约定

规范页应至少填写：

```yaml
coreVersion: 3ec28fc
manifestVersion: v3
status: preview
lastVerifiedWith: 3ec28fc
sourceRefs:
  - schemas/shaderpack.schema.json
searchAliases:
  - 设置菜单
```

`sourceRefs` 使用 `contracts/dawnlight/preview/contract-lock.json` 中的相对路径。`lastVerifiedWith` 必须是锁定 Core commit 的完整值或前缀；当前 contract 仍然是 preview-only，不能写成稳定 ABI。

`searchAliases` 只用于用户确实会搜索的中文术语、英文机器 ID 和诊断码，不替代正文解释，也不应加入无关关键词。

## 静态搜索策略

搜索端点仍然在构建期执行 `createFromSource(source)` 并导出 `out/api/search`。运行时页面只加载静态索引，不访问数据库或在线 API。多语言 tokenizer 负责中文和 ASCII token；aliases 被追加为一个不可见于正文结构、但可被索引的内容块。

当前固定回归词：

| 词 | 预期页面 |
| --- | --- |
| 设置菜单 | `/zh-CN/docs/preview/pipeline/overview` |
| `drawbuffers` | `/zh-CN/docs/preview/pipeline/overview` |
| `historyCommit` | `/zh-CN/docs/preview/pipeline/overview` |
| `P9UI203` | `/zh-CN/docs/preview/pipeline/overview` |

## 验证命令

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:contract
pnpm validate:content
pnpm build
pnpm verify:static
```

WP4 验收关注：

- 文档首页和管线参考页均能静态生成；
- 桌面侧栏、TOC、面包屑和上一页/下一页可由 Fumadocs 正常提供；
- 移动端使用 DocsLayout 抽屉，不新增运行时路由；
- 搜索索引包含中文、英文 ID、诊断码和对应文档 URL；
- 内容校验拒绝未知 sourceRef、失效内部链接、重复 slug 和本机绝对路径。

## 后续边界

- WP5 再按首发内容树补齐 Manifest、Program、Resource、Pass、Settings UI、CLI 和限制参考，不在 WP4 创建空社区页面；
- 第二语言上线前不引入 locale middleware；
- 正式稳定合同发布后，复制 `preview` 文档树到新版本目录并更新 `siteConfig.docsVersions`，不要原地改变既有 preview URL 的语义。
