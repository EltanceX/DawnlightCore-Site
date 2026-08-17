# WP5：首发文档内容

状态：Preview 首发内容已补全；真实 CLI、技术审核和稳定合同仍待完成

日期：2026-08-17

## 交付内容

- 按 V1 实施方案创建 `00-overview` 至 `07-migration` 首发内容树，共 31 个受校验的首发文档 slug；连同首页、pipeline fixture 等共 33 个 MDX 文件；
- 为每个目录创建 Fumadocs metadata 文件，冻结 authored order 和中文显示名称；
- 完成“概览 -> 前置条件 -> 最小包 -> 验证 -> Manifest/Settings UI 参考”的新作者路径；
- 覆盖 Manifest 根对象、options、Programs、defines/variants、Resources、Passes/commands、Semantics/bindings；
- 覆盖 Settings UI 的 overview、pages/groups/controls、conditions 和 localization；
- 提供 fullscreen、compute、history resource 和完整包路线图四个实践指南；
- 提供 Manifest 字段、command types、diagnostics、limits 和 version policy 参考；
- 所有页面显示 Core `3ec28fc`、Manifest v3、适用状态和 `lastVerifiedWith`；需要 Settings UI 的页面额外显示 v1-preview；
- 文章明确区分 preview、experimental、schema-only、Loader 验证和未提供的 CLI JSON contract；
- 新增 JSON/GLSL/C# 边界、BuiltIn Minimal 与 External Complete 对比、CLI 安装与验证记录格式页面；
- 内容校验增加首发页面清单，防止目录不完整；静态 smoke 增加中文术语、英文 ID、诊断码和跨主题搜索回归。

## 内容边界

本批内容基于 `contracts/dawnlight/preview` 快照重写，不直接公开 Core 内部类名或工作树修改。Dawnlight v3.1 只作为纵向示例，不能据此声称所有光影包都支持相同 Service、EngineDraw Provider 或资源 factory。

当前 CLI 页面明确写出 `unavailable` 和 `schema-only` 状态。网站不伪造本地 Core 命令、退出码或 JSON 输出；作者需要在目标 Core 构建中重新执行 Loader 验证并保存 commit、诊断码和输入 hash。

## 内容树

```text
00-overview/       概览、能力与限制
01-getting-started/前置条件、最小包、CLI 验证
02-concepts/       包模型、Catalog 边界、生命周期
03-manifest/       根对象、Program、Resource、Pass、语义
04-settings-ui/    Settings UI 页面、控件、条件、本地化
05-guides/         fullscreen、compute、history、完整包路线图
06-reference/      字段、commands、diagnostics、limits
07-migration/      版本策略
```

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

内容门禁会检查：

- 31 个首发 slug 是否全部存在；
- frontmatter title 和验证 commit；
- sourceRefs 是否存在于 contract lock；
- 绝对本机路径和失效内部链接；
- 静态输出是否包含代表性页面；
- 中文术语、英文机器 ID、诊断码和 `schema-only` 是否能命中预期页面。

## 当前未完成

- `ShaderPackCli` 仍没有可发布的稳定二进制、安装渠道或结构化 JSON contract；
- `schema-only` 示例尚未由同一 Core commit 的真实 Loader 运行结果替换；
- 内容尚未完成非实现者技术审核、编辑审核和新作者试走；
- BuiltIn/External、格式边界和验证流程已补齐文档，但稳定版本和生产兼容性声明仍被 Preview contract 门禁限制。

## 后续工作

WP5 之后的内容维护应以真实 Core contract 更新为触发点：先同步 lock/schema/catalog，再更新受影响页面和迁移说明。新增英文版本、稳定合同或社区项目页都应作为独立工作包处理，不在本批内容中隐式扩展范围。
