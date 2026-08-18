# V2-WP9-0：Beta 关键决策登记

状态：工程决策已冻结；外部资源和实名责任人未就绪时只允许进入 WP9-A，不得宣称 Beta 已发布

日期：2026-08-18

上位文档：[V2 实现方案](./DawnlightCoreWebsiteV2ImplementationPlan.md)

基线提交：`641a042 feat(v2): add search analytics and operations console`

## 1. 决策规则

本登记冻结 WP9 的 Validator 供应链、撤回语义、Beta 拓扑和运营责任。后续实现不得静默改变这些边界；变更必须新增 ADR，说明威胁、迁移、回滚和重新演练范围。

WP9 分为两个门禁：

- **WP9-A 工程演练**：在 arch-vm 使用隔离 Compose、测试 OIDC 和测试密钥验证应用镜像、完整工作流及故障恢复；
- **WP9-B 真实 Beta 验收**：使用独立真实 staging 数据库、bucket、OIDC client、CDN、TLS 和实名责任清单，完成参与者任务观察和签字。

WP9-A 通过不自动满足 WP9-B，V2.1 Beta 通过也不自动批准 V2.2 公开社区。

## 2. 冻结决策

| ID | 主题 | 冻结结论 | 重新评审触发条件 |
| --- | --- | --- | --- |
| WP9-D01 | Validator 供应链 | Core CI 从精确 clean commit 构建，默认发布到 `ghcr.io/eltancex/dawnlight-validator`；部署只接受 manifest digest | Core 仓库/Registry 迁移，或构建信任根变化 |
| WP9-D02 | 撤回与紧急下架 | `withdrawn` 是普通下架；新增 platform-admin-only `takedown` 处理安全、法律和版权事件 | CDN 不支持精确 purge/deny，或法务保留要求变化 |
| WP9-D03 | Beta 运行拓扑 | 单 API 实例、单 Worker 服务、PostgreSQL/pg-boss、S3 和边缘限流；不引入 Redis/Valkey | API 扩到多实例，或边缘限流无法覆盖写入口 |
| WP9-D04 | 运营责任 | 责任按角色分离，实名映射放在受控环境清单；未指派、无替补或无联系方式时阻断 WP9-B | 团队、provider、数据控制者或 SLA 变化 |

## 3. WP9-D01：Validator 供应链

### 3.1 信任链

生产候选 Validator 必须满足：

1. 构建发生在 DawnlightCore/Survivalcraft Core 的受信 CI，而不是网站仓库或维护者工作站；
2. checkout 精确 `LOADER_CORE_COMMIT`，工作树无补丁；
3. 私有 NuGet 凭据只在构建 job 内使用，不进入 layer、artifact、日志或网站 secret；
4. CI 执行 `dotnet publish`、CLI 基线验证、镜像构建和容器隔离 smoke；
5. 生成 SPDX/CycloneDX SBOM、构建 provenance、镜像漏洞报告和 CLI 输出摘要；
6. 推送 commit tag 仅用于定位，staging 配置必须使用 Registry 返回的 `repository@sha256:...`；
7. 使用 GitHub OIDC keyless attestation，部署前校验 repository、workflow、commit 和 digest；
8. 网站仓库只记录 digest、Core commit、CLI version 和证明引用，不复制 Loader 源码或二进制。

`Dockerfile.prepublished` 只接受同一受信 Core CI 产生并带 SHA-256/provenance 的 publish artifact。开发者本机输出继续只允许用于 WP9-A 隔离测试。

### 3.2 发布权限

- GHCR package write 只授予 Core CI environment；
- 网站部署账户只有 pull 权限；
- Worker 不获得 Registry push、NuGet、GitHub 或 attestation 签名权限；
- tag 不可作为部署值，`latest` 禁止创建；
- digest 被发现有漏洞时加入部署 denylist，不能用同一 tag 覆盖修复。

### 3.3 WP9-B 门禁

- [ ] Registry package 已创建且读取策略验证；
- [ ] Core CI workflow 的 OIDC provenance 可验证；
- [ ] 实际 image digest、Core commit、CLI version 和 SBOM 已登记；
- [ ] 无未接受的 high/critical 镜像漏洞；
- [ ] 固定 digest 在 staging 的无网络、只读、非 root smoke 通过。

## 4. WP9-D02：撤回与紧急下架

### 4.1 两种动作

| 动作 | 权限 | 用途 | 公开行为 | 对象行为 |
| --- | --- | --- | --- | --- |
| `withdraw` / delist | 项目 owner 或 platform-admin | 作者停止分发、兼容性过期、普通版本替代 | 立即离开默认目录、搜索、推荐和 feed；保留历史状态与公告 | 不复用 key；允许按普通保留策略保存 |
| `takedown` | platform-admin | 恶意包、密钥泄漏、版权/法律、安全事件 | API 和 CDN 在目标时限内对已知 URL 返回 `404/410`；显示最小必要公告 | purge/deny 后移入受限 evidence 区或按批准策略删除 |

作者撤回不能自行执行 `takedown`。任何 takedown 必须填写原因类别和非空说明，要求 Origin、CSRF、幂等键、二次确认和 append-only audit。

### 4.2 不变量

- artifact object key、SHA-256 和历史审核决定永不被另一个文件复用；
- takedown 后保留最小元数据：project/version、digest、大小、决定、时间和 actor 替代 ID；
- 举报联系人、原始包和证据访问权与公开目录分离；
- CDN 必须支持精确 URL purge 或 edge deny；仅修改数据库状态不算完成 takedown；
- 已下载到终端的副本无法远程撤销，公告不得作出相反承诺；
- 安全 P0 先暂停上传/发布队列，再调查原因，不等待常规发布窗口。

### 4.3 时限

- P0（公开 quarantine、恶意 artifact、凭据泄漏）：15 分钟内确认，60 分钟内阻断公开访问；
- P1（可信版权/许可证紧急请求）：1 个工作日内确认，按批准结论执行；
- 普通作者撤回：操作成功后一个 feed TTL 内离开公共推荐。

WP9-2 必须用 `0008+` migration 和新 API 实现 takedown，不得回改 `0006`/`0007`。CDN purge/deny 未接入前，系统只能声明支持 delist。

## 5. WP9-D03：Beta 拓扑与限流

### 5.1 WP9-A

arch-vm 使用独立 Compose project、volume、端口和测试 secret：

```text
Caddy
  -> static Web
  -> one API process
       -> PostgreSQL / pg-boss
       -> MinIO
       -> mock OIDC
  -> published test origin
one Worker process -> one-shot isolated Validator containers
```

WP9-A 不接触现有 production/preview bucket，不复用 bootstrap token，不把测试 artifact 加入正式 feed。

### 5.2 WP9-B

- Web 继续使用不可变静态 artifact；动态私有页面连接 staging API；
- API 和 Worker 使用独立 OCI image 与 service account；
- 单 API 实例是邀请制 Beta 的明确容量/可用性取舍，不宣称高可用；
- pg-boss 继续承担队列，不增加第二套 broker；
- CDN/ingress 对 search、download、upload、login 和 report 实施共享限流，应用内限流作为第二层防护；
- `TRUST_PROXY` 只信任列出的 ingress hop；业务数据库不保存完整 IP；
- API 扩容为两个及以上实例前，必须引入共享 Valkey/Redis 限流或证明所有限制均由可信 edge 原子执行；
- 公共下载只经过 published CDN，quarantine/derived bucket 禁止匿名访问。

### 5.3 容量触发器

任一条件连续两个观测窗口成立时重新评审拓扑：API CPU 超过 70%、公共 GET P95 超过 500 ms、队列不能在 15 分钟内回落、单实例维护窗口不可接受，或 Beta 参与者规模超过邀请名单。未达到触发器前不引入 Kubernetes、Elasticsearch、独立消息队列或多节点缓存。

## 6. WP9-D04：运营责任与分离

仓库只冻结角色，不提交姓名、个人联系方式、账号 ID 或 provider secret。实名映射存入 staging secret manager/受限值班清单，并至少每个 Beta 周期复核一次。

| 角色 | Accountable 范围 | 不得兼任/限制 |
| --- | --- | --- |
| Release Owner | 最终 go/no-go、风险接受、Beta 范围 | 不能替作者完成参与者验收 |
| Core Supply-chain Maintainer | Core commit、Validator CI、SBOM/provenance | 不能用本机二进制替代 CI 证明 |
| Infrastructure Operator | 部署、备份恢复、S3/CDN、密钥轮换 | 不决定内容审核结论 |
| Incident Commander | P0 分级、暂停队列、takedown、复盘 | 事件中拥有临时协调权但所有动作可审计 |
| Reviewer Lead | 审核 SLA、冲突回避、决定质量 | 作者不能审核自己的 submission |
| Privacy & Abuse Owner | 举报、版权、导出/删除、保留例外 | 不可把下载统计用于个人画像 |

最小人员门禁：至少两名可恢复访问的 platform-admin；每个角色有一名 primary 和一名 backup；同一个人可以在小规模 Beta 兼任多个运维角色，但 submission reviewer 必须与提交者独立，风险接受必须由 Release Owner 显式记录。

责任清单必须记录角色、账号、受控联系方式、时区、primary/backup、确认日期和失效日期。缺少任一必需角色或 backup 时，允许继续自动化开发，但禁止 WP9-B 邀请真实作者。

## 7. WP9-0 退出审计

| 条件 | 结果 |
| --- | --- |
| Validator 构建、证明、Registry 和部署引用方式冻结 | 已冻结；实际 GHCR package/digest 待 WP9-1 |
| withdraw/delist 与 takedown 语义冻结 | 已冻结；takedown 数据/API/CDN 实现待 WP9-2 |
| Beta 单实例拓扑和扩容触发器冻结 | 已冻结 |
| 运营角色、分离和实名清单规则冻结 | 已冻结；实名 primary/backup 待 WP9-B 前指派 |
| 未决外部项被错误标为完成 | 无；均保留显式门禁 |

WP9-0 的工程决策退出条件已满足。下一步进入 WP9-1：可复现服务镜像与 arch-vm 完整 staging 编排。
