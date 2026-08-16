# WP3：Developer Contract 接入

状态：已完成

日期：2026-08-16

## 交付内容

- 从 WP0 冻结的 Core commit `3ec28fc9461e6b1636ad4adc086e9cea8150c02e` 生成 preview contract snapshot；
- `contract:sync` 只使用 `git ls-tree`、`git show` 和锁定 commit metadata，不读取 Core working tree；
- 导入 Dawnlight v3.1 Manifest、Settings UI，以及 P4 Minimal、P9 Settings UI 和 Dawnlight v3.1 三组示例；
- 建立网站维护的 preview Schema：`shaderpack.schema.json` 和 `settings-ui.schema.json`；
- 建立 Catalog 摘要，记录 Stage Template、Service、Semantic Provider、EngineDraw Provider 和 Capability IDs；
- 建立稳定诊断代码表，区分 Catalog diagnostics 与 Manifest warning；
- 建立 `cli/metadata.json`，明确当前锁定快照没有公开结构化 CLI JSON contract；
- `contract-lock.json` 记录来源 commit、导出模式、所有输入 hash/bytes、验证状态和 preview 阻塞原因；
- `validate:contract` 使用 Zod 做 manifest/settings/metadata/lock/示例/路径/hash 校验；
- Web 端通过 `src/lib/contract.ts` 消费仓库内固定快照，不依赖本机 Core 路径；
- 新增 `VerifiedCodeBlock`，在文档中显示示例相对路径、校验方式和 Core commit 短 hash。

## 快照目录

```text
contracts/dawnlight/preview/
├─ contract-lock.json
├─ metadata.json
├─ schemas/
├─ catalogs/summary.json
├─ diagnostics/diagnostics.json
├─ cli/metadata.json
└─ examples/
   ├─ minimal/
   ├─ settings-auto/
   ├─ settings-authored/
   └─ verification.json
```

## 命令

```text
pnpm contract:sync
pnpm validate:contract
```

可覆盖默认来源：

```text
node scripts/sync-dawnlight-contract.mjs \
  --repo "E:/path/to/DawnlightCore" \
  --commit "<40-char-commit>"
```

脚本会拒绝不存在的 commit 或缺少的 source path；运行后必须继续执行 `pnpm validate:contract`。

## 合同边界

- `schemas/*` 是网站 preview 编辑/文档合同，不是稳定 ABI；
- `catalogs/summary.json` 只暴露公共 ID 和版本摘要，不把 C# runtime 行为复制到 TypeScript；
- `diagnostics/diagnostics.json` 只记录稳定机器代码，不承诺所有文本消息永不变化；
- `examples/verification.json` 当前为 `schema-only`，因为网站静态构建不会执行 C# Loader；
- `cli/metadata.json` 明确标记 `unavailable`，直到 Core 提供生产 CLI 和 JSON 输出合同；
- `contract-lock.json` 的 `blockingReasons` 保留 preview/stable 门禁，不能直接用于稳定文档或社区上传校验。

## 验证结果

WP3 已通过：

```text
pnpm install --frozen-lockfile
pnpm validate:contract
pnpm check
```

静态构建只读取网站仓库中的 `contracts/dawnlight/preview`，不要求 Core 源仓库存在；Core 源仓库的未提交 ToonLab 修改未被读取或更改。
