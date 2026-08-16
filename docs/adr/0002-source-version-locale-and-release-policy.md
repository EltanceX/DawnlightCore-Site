# ADR-0002：来源、版本、语言与发布策略

状态：部分冻结；开放项见决策登记表

日期：2026-08-16

## 现状证据

检查到的 DawnlightCore 工作树信息：

| 项目 | 结果 |
|---|---|
| 技术 Git 远程 | `https://github.com/EltanceX/DawnlightCore.git` |
| 现有发行/社区远程 | `https://gitee.com/SC-SPM/SurvivalcraftApi.git` |
| 当前分支 | `dawnlight-upgrade-1.9.2.1-vr` |
| 最近有标记的 API 版本 | `API_1.9.2.1` |
| `API_1.9.2.1` commit | `675efcde9459121c5374ee82f88d680efdb943e4` |
| 当前候选光影快照 commit | `3ec28fc9461e6b1636ad4adc086e9cea8150c02e` |
| 当前工作树 | 有未提交 ToonLab 相关修改，不能直接作为发布源 |
| Dawnlight external pack | `dawnlight:dawnlight_v3_1`，Manifest v3 |

## 冻结决策

### 1. 技术来源和发行来源分开

- Core、Loader、Manifest 合同和开发者 contract 的技术来源记录为 GitHub DawnlightCore；
- 面向 Survivalcraft API 的现有正式发行说明和历史下载入口记录为 Gitee；
- 网站不会把两个远程仓库混写成一个 source of truth；
- 每个 release source 必须明确 `technicalSource` 和 `distributionSource`。

### 2. 文档版本使用不可变 ID

V1 路由使用 `/{locale}/docs/{docsVersion}/...`。在正式公共 ABI 版本尚未确定前，文档 ID 使用 `preview`，并默认 `noindex`。正式发布时复制为实际版本 ID，而不是让 `latest` 永久指向可变内容。

当前候选 contract 的来源为 `3ec28fc9461e6b1636ad4adc086e9cea8150c02e`。本地工作树处于脏状态，因此 contract 只能从该 commit tree（例如 `git archive` 或独立 checkout）导出，不能直接读取当前工作树。它只作为 WP0 的候选参考。

### 3. 首发语言

V1 完整发布 `zh-CN`。代码、ID、路径和诊断代码保持原文。`en-US` 只在拥有完整最小内容、UI message 和搜索索引后加入发布 locale，不显示空的语言入口。

### 4. 首发渠道

当前没有从核心工程和发行仓库证实一个可直接填入网站的 DawnlightCore 官方稳定 artifact URL、大小、hash 和签名。因此 V1 的下载源在 WP0 中保持 `pending`，不能用 Debug 输出目录或本地文件作为生产下载。

## 未冻结开放项

- 正式网站域名和 canonical origin；
- V1 首个可公开下载的 Core release 版本；
- GitHub/Gitee/对象存储的主下载源顺序；
- Ed25519 release feed 公钥、key ID 和密钥轮换位置；
- Windows/Android/Linux/iOS 是否在同一 V1 发布页展示；
- 官方 Logo、Dawnlight 品牌图形和实机截图的公开授权；
- `preview` 文档是否允许搜索引擎索引。

## 影响

WP1 可以使用 `preview` 和本地测试 feed 完成 UI Spike，但 WP6 下载正式实现和生产发布必须等待上述 release/域名/资产门禁关闭。
