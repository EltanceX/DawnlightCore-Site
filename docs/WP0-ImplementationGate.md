# WP0 实现门禁与交接记录

状态：WP0 盘点完成，生产发布门禁未关闭

日期：2026-08-17（进度同步）

## 已完成

- [x] V1 静态范围和后端延后策略已记录；
- [x] 技术源和发行源已分离；
- [x] `preview` 文档版本策略已冻结；
- [x] `zh-CN` 首发 locale 策略已冻结；
- [x] release feed v1 的 source、校验和签名策略已确定；
- [x] Core 候选 commit、Manifest v3 和 Dawnlight v3.1 pack id 已记录；
- [x] 现有图像、shaderpack 和构建输出已盘点；
- [x] 两张候选 hero 截图已目视检查并拒绝；
- [x] 网站仓库 `.gitignore` 已建立。
- [x] Preview 文档首发内容已覆盖格式边界、内置/外置包边界和 CLI 验证记录格式；
- [x] V1 质量门禁、Preview artifact、部署 smoke 和回滚契约已实现；

## 阻塞项

| 阻塞项 | 状态 | 解除方式 |
|---|---|---|
| 正式网站域名 | Open | 确认 canonical origin 和部署目标 |
| 正式下载 artifact | Open | 从 Release/对象存储取得 URL、size、SHA-256 和签名 |
| Hero 截图 | Open | 修复当前渲染伪影后重新采集 |
| Logo/品牌授权 | Open | 明确可使用的 Logo/icon 或制作新网站 Logo |
| 镜像策略 | Open | 确认 Gitee/全球/CDN 主次顺序 |
| Core contract | Preview validated, stable blocked | 由锁定 commit tree 生成并验证 Schema/Catalog/diagnostics/examples；CLI JSON 仍未提供 |

## 进度解释

当前 `WP1` 至 `WP8` 的 Preview 工程路径已经可以构建、搜索、测试和生成静态 artifact。新增文档只补齐了作者理解和记录验证所需的说明，不改变 `preview` contract、空 release feed、概念 Hero 或生产 gate 的事实状态。上表 6 个阻塞/开放项仍然是正式上线前置条件。

## 可以立即进入 WP1 的部分

- Next.js/Fumadocs static export spike；
- 设计 token、Header、Footer、主题和空页面；
- `zh-CN/preview` 文档路由；
- 本地 release feed fixture 和 artifact 推荐纯函数；
- 合同锁定文件读取和校验脚本；
- 搜索索引生成 spike；
- 不依赖正式域名和生产 artifact 的 Playwright 结构测试。

## 不能在门禁关闭前做的事情

- 将 Debug 输出或工作树文件发布为下载；
- 将现有两张截图当作首页 hero；
- 将 Survivalcraft Logo 直接改色或裁切为 DawnlightCore Logo；
- 把 `API_1.9.2.1` 标签直接称为当前光影管线稳定 ABI；
- 公开 `preview` contract 为 stable；
- 让网站通过本机绝对路径读取 Core/官方原版资源；
- 写死未经确认的域名、镜像和签名 key。

## WP1 交接输入

WP1 实现者应从以下文件开始：

- `docs/adr/0001-v1-scope-and-static-publishing.md`；
- `docs/adr/0002-source-version-locale-and-release-policy.md`；
- `docs/WP0-DecisionRegister.md`；
- `docs/WP0-AssetInventory.md`；
- `contracts/release-feed-v1.schema.json`；
- `contracts/dawnlight/preview/contract-lock.json`；
- `docs/DawnlightCoreWebsiteV1ImplementationPlan.md` 的 WP1/WP2/WP3 章节。
