# Website Contracts

本目录保存网站消费的、可版本化的机器合同。

- `release-feed-v1.schema.json`：V1 官方发布清单的结构 Schema；
- `dawnlight/{version}/`：由 DawnlightCore 固定 commit 导入的 Schema、Catalog、diagnostics 和 examples；
- `contract-lock.json`：记录来源仓库、commit、Core/Manifest 版本和输入 hash。
- `contract-manifest.json`：WP2 ingest 输入合同、数据集 hash、可用性和签名 envelope；
- `ingest-fixture.json`：API 与静态工具页共同消费的规范化只读数据；
- `directory-fixture.json`：V2-WP4 的 Project、Version、Artifact、Compatibility、Image 和 License 只读候选快照；
- `contract-ingest-lock.json`：规范化 fixture、manifest hash、行数和原子激活策略锁定记录。

`contracts/dawnlight/preview/contract-lock.json` 当前是 `preview-validated`，不是稳定公共 ABI。它明确记录了当前工作树脏状态，并由 `git show <commit>:<path>` 生成，避免网站构建意外读取开发者本机路径或未提交修改。

更新快照：

```text
pnpm contract:sync
pnpm validate:contract
pnpm validate:contract:ingest
```

`contract:sync` 默认使用 WP0 冻结的 Core commit；更换来源时必须显式传入 `--repo` 和 `--commit`，并在同一提交中审阅 lock、hash、Schema 和示例差异。

网站不得在 TypeScript 中重新实现 DawnlightCore Manifest Loader。Schema 用于编辑提示和文档，最终语义仍由生产 C# Loader/CLI 决定。

WP2 的当前快照仍为 `preview-validated` / `unsigned-preview`。未提供生产签名密钥时，ingest 只允许在 development/test/preview 使用；production 配置必须要求已验证的 Ed25519 签名。Graph 和 Variant 以 `unavailable` 记录导入，不能由网站推断。
