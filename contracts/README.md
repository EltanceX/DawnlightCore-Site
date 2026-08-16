# Website Contracts

本目录保存网站消费的、可版本化的机器合同。

- `release-feed-v1.schema.json`：V1 官方发布清单的结构 Schema；
- `dawnlight/{version}/`：由 DawnlightCore release/contract 导入的 Schema、Catalog、diagnostics 和 examples；
- `contract-lock.json`：记录来源仓库、commit、Core/Manifest 版本和输入 hash。

`contracts/dawnlight/preview/contract-lock.json` 当前是带阻塞状态的候选记录，不能作为稳定公共合同发布。它明确记录了当前工作树脏状态，避免网站构建意外读取开发者本机路径或未提交修改。

网站不得在 TypeScript 中重新实现 DawnlightCore Manifest Loader。Schema 用于编辑提示和文档，最终语义仍由生产 C# Loader/CLI 决定。
