# V2-WP7：真实 Loader 验证与审核发布

状态：代码实现完成，真实 CLI 隔离链路已在 arch-vm 通过；生产 Validator 镜像与 Beta 发布仍被外部供应链和运营门禁阻塞。

## 1. 目标与边界

WP7 把 WP6 的 `passed` quarantine 上传推进到“固定 Loader 验证 -> 作者提交 -> 独立审核 -> 不可变 published artifact”的受控闭环。公开目录只读取 `published`/`available` 投影；`validating`、失败、待审、`publishing`、`publish-failed` 和撤回版本不会进入默认下载。

本批不宣称已经完成生产部署、真实 CDN、公开社区投稿或无人值守审核。生产仍必须补齐 Core CI provenance、Registry manifest digest、签名密钥托管、版权/滥用处理和 staging 演练。

## 2. 状态机与持久化

版本状态：

```text
draft -> validating -> draft | loader-failed
draft/changes-requested -> awaiting-review
awaiting-review -> changes-requested | rejected | approved
approved -> publishing -> published | publish-failed
published -> withdrawn
```

`packages/database/migrations/0006_loader_review_publish.sql` 新增：

- `loader_validation_runs`：每次真实 Loader 尝试的 image、CLI、Core commit、输入 SHA-256、分段结果、退出码和日志摘要；
- `loader_job_outbox`：Loader 作业的事务 outbox；
- `review_submissions` / `review_decisions`：冻结 metadata、审核状态和 append-only 决定；
- `publish_job_outbox` / `publication_runs`：发布作业、重试、基础设施失败和死信前的最终状态；
- `published_artifacts`：hash-addressed object key、大小、URL 和撤回状态；身份字段由数据库触发器保护不可变；
- `release_feed_snapshots`：canonical JSON、SHA-256、Ed25519 签名和 key id；
- `withdrawal_announcements`：撤回原因和操作者。

作者只能在 `draft`/`changes-requested` 编辑；提交审核时必须绑定当前版本通过的 Loader run，并声明 SPDX 许可证。审核员不能审核自己的提交；批准、拒绝、要求修改、发布和撤回均写入审计事件并要求 Origin/CSRF/幂等边界。

## 3. 真实 Loader 验证

`apps/worker/src/validator.ts` 在一次性 0700 临时目录中流式下载 quarantine 对象，重新计算 SHA-256，安全解压后校验 `shaderpack.json.version` 与草稿版本一致，再调用：

```text
settings validate /input
```

容器调用固定为：无网络、只读根文件系统、UID/GID `65532`、drop all capabilities、`no-new-privileges`、PID 64、CPU/内存上限、仅 `/input:ro` 包目录挂载和受限 `/tmp`。Worker 不向容器传数据库、S3、OIDC 或发布签名密钥。

CLI 输出被拆为 `schema`、`loader`、`security`、`resource`、`compatibility` 五段。只有退出码为 0、`valid=true` 且 diagnostics 为 0 才是 `loader-passed`；超时为 `timed-out`，内容结果不重试，S3/进程/数据库故障使用有限重试，最终写入 `infrastructure-error` 并进入 dead-letter。

Validator 镜像：

- `infra/validator/Dockerfile`：从与 `LOADER_CORE_COMMIT` 相同且干净的 Core 源码多阶段构建；
- `infra/validator/Dockerfile.prepublished`：仅供 Core CI 已证明的 `dotnet publish` 输出构建 runtime 镜像，不能把开发者本地产物当生产 provenance；
- `LOADER_VALIDATOR_IMAGE` 强制 `repository@sha256:<64 hex>`，拒绝 tag 和本地 image ID。

## 4. 审核与发布

作者工作区新增验证状态、分段诊断、提交审核和撤回；审核队列提供版本冻结 metadata、许可证、hash、Core commit、CLI/image 信息和五段结果，并要求危险决定输入 reason 与二次确认。

批准后，Worker 服务端从 quarantine `CopyObject` 到：

```text
shaderpacks/{project-slug}/{version}/{sha256}.zip
```

随后以 HEAD 重新确认大小和 `x-amz-meta-sha256`，生成 public URL、canonical JSON 和 Ed25519 签名，事务内写入 `published_artifacts`、目录版本/兼容性/ artifact 投影、feed snapshot，并最终把 submission/version 标记为 `published`。失败会记录 `publication_runs`，达到重试上限后标记 `publish-failed`，不会泄漏半成品到默认目录。撤回只改变可见状态，保留对象 hash、历史决策和公告；新修复必须创建新版本。

## 5. arch-vm 验证记录（2026-08-18）

目标主机：`192.168.137.202`，隔离 Compose 项目 `dawnlight-wp7-test`。`0001`–`0006` migration 已在 PostgreSQL 16.4 成功执行，表和约束创建正常。

真实 Core CLI 基线：

```text
Core commit: de780e826a1a8537cf120600caf68e9d890737ac
packId: dawnlight:dawnlight_v3_1
manifestSha256: e9d84f004a8dc80b125b7ffb9b15f6f4b52559583aeeac53e8e8a54120286e4a
settingsSha256: 9c937dc5fd1be30864ff7f4da69db31d261920773b1d8c78b735d5f643538de1
options: 43
coverage: 43/43
diagnostics: 0
```

同一 CLI publish 输出在 arch-vm 以官方 `.NET SDK 10.0` 镜像执行，使用 `--network none --read-only --user 65532:65532 --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 768m --cpus 1` 和只读包挂载，退出码 0 且输出与本地基线一致。这证明真实 Loader CLI、Core shader 包和隔离参数可以协同工作，但该 SDK 临时运行容器不是生产 Validator 镜像。

生产镜像构建尝试：

1. Core 源码多阶段 Docker build 在 `nuget.fury.io/survivalcraftapi` 遇到 TLS `unexpected EOF`，无法把私有包还原完成；
2. runtime-only 构建拉取 `mcr.microsoft.com/dotnet/runtime:10.0-noble-chiseled` 时遇到 manifest EOF；
3. 因此当前没有伪造 registry digest，也没有声称生产镜像可部署。Core CI 需要在稳定网络/私有 feed 凭据下生成并 attestation publish 输出，再推送 manifest digest。

本地 Windows `dotnet publish --no-restore` 使用缓存包成功，仅作为上面的隔离验证输入；临时 tar/publish 目录不属于仓库发布资产。

## 6. 测试与门禁

- `apps/worker/src/validator.test.ts`：CLI 键值转分段报告、版本不匹配、真实 transcript；
- `apps/worker/src/publication.test.ts`：canonical JSON 排序、Ed25519 签名、hash-addressed key 和 HEAD hash/size 校验；
- `apps/worker/src/preflight.test.ts`：WP6 危险 ZIP fixture；
- `apps/api/tests/app.test.ts`：workflow 私有投影、Origin/CSRF/幂等、审核队列；
- `scripts/validate-v2-workspace.mjs`：WP7 文件、迁移、digest-pinned image 和入口限制；
- 当前聚焦结果：Worker 23 tests、API 5 tests、类型检查、V2 workspace validation 均通过。

上线前还必须补做：Core CI provenance/签名 attest、Registry digest pin、MinIO published bucket policy、完整 API+Worker+pg-boss Compose staging、发布失败/死信演练、撤回后 CDN 缓存失效、签名公钥轮换、NCalc 依赖安全公告复核。

## 7. 退出条件审计

| 条件 | 当前结果 |
| --- | --- |
| 真实 Loader 可执行且 Core commit/CLI 可追溯 | 已在本地与 arch-vm 隔离运行通过 |
| 五段验证结果、失败/超时/基础设施重试 | 代码与测试已实现 |
| 作者修订、独立审核、审计和撤回 | 代码与 API/UI 已实现 |
| published artifact hash 不可变、默认目录无失败版本 | 数据库约束与发布事务已实现 |
| 生产 Validator image 有可信 Registry digest | 待 Core CI/Registry 外部门禁 |
| staging 端到端发布/撤回演练 | 待具备完整应用镜像和稳定依赖源的环境 |
