# V2-WP9-3：第一层完整发布、撤回与故障演练

状态：工程实现与 arch-vm disposable 演练完成。该状态只表示 WP9-A 可重复演练，不表示第一次真实 Beta 发布已获批准

## 1. 目标与证据边界

WP9-3 把第一层 Compose 从“服务可启动、takedown 可验证”推进到完整发布生命周期：

1. Worker 停止时建立已批准的 publication outbox，确认运营侧能看到队列积压；
2. Worker 恢复后，从私有 quarantine bucket 复制对象、核验大小和 SHA-256 metadata；
3. 在单个数据库事务中生成 published artifact、目录投影、签名 feed snapshot，并切换 author/review 状态；
4. 通过公开 API 验证目录、搜索、下载解析和已知 URL；
5. 执行普通 `withdraw`，验证新下载与搜索消失，但已知 URL 按冻结语义继续提供带 `withdrawn` disposition 的对象；
6. 中断 MinIO，确认 API readiness 失败、发布重试产生基础设施失败记录，且 artifact、目录与 feed 均未公开；
7. 恢复 MinIO，确认 pg-boss 重试最终只产生一个可用 artifact 和一个 feed snapshot；
8. 生成不含 secret、个人信息和原始包内容的 JSON 审计报告。

第一层使用最小合法 ZIP 和明确标记的 `prevalidated-wp9-a-fixture`。它故意绕过真实 Loader，只证明发布编排、数据库事务、对象存储、公开门禁和故障恢复。报告固定写入：

```json
{
  "evidenceClass": "engineering-only",
  "candidateEvidence": false,
  "validatorMode": "prevalidated-fixture"
}
```

因此该报告不能替代 Validator digest、真实 Core commit/CLI 输出或 WP9-B 候选发布证据。

## 2. 实现组成

| 组成 | 文件 | 职责 |
| --- | --- | --- |
| 数据夹具 | `packages/database/scripts/smoke-release-staging.mjs` | 确定性建立 approved submission/outbox，查询生命周期状态，并通过正式 operations service 执行 withdraw |
| 演练编排 | `scripts/run-wp9-a-release-drill.mjs` | 控制 Worker/MinIO、写入测试对象、轮询状态、调用公开 HTTP 边界并生成报告 |
| PostgreSQL 修复 | `packages/database/src/publishing.ts` | 将带参数的多语句查询拆为同一事务内的独立语句，兼容真实 PostgreSQL prepared statement |
| 自动门禁 | `scripts/validate-wp9-first-stage.mjs` | 要求完整生命周期、故障恢复、证据降级标记与真实发布门禁文档存在 |

夹具 ID 由 run ID 和场景名确定性派生，便于多个子步骤查询同一实体；run ID 每次随机生成，因此不会复用 slug、artifact key 或幂等键。脚本只允许 basename 为 `wp9-a.compose.yml`、包含 mock OIDC 且显式确认 `DISPOSABLE-STAGING` 的目标。

## 3. 正常发布路径断言

正常场景的退出断言为：

- outbox 在 Worker 停止时保持 `dispatched_at is null`；
- review submission 与 author version 最终为 `published`；
- `published_artifacts` 恰好一个且状态为 `available`；
- directory version/artifact 均为 `available`；
- 该 version 的 completed publication run 和 feed snapshot 各一个；
- artifact object key 由 `project slug/version/input sha256` 构成；
- 已知 URL 返回 `200`，响应大小与 SHA-256 和夹具一致；
- download resolver 返回 `302` 到受 API 门禁保护的已知 URL；
-目录详情与搜索能发现新项目。

对象复制发生在数据库事务之前。如果对象复制成功而事务失败，公开 gateway 仍因没有 `published_artifacts` 记录返回 `404`；重试复用内容寻址 key，并由最终事务只生成一个公开身份。这是当前第一层的可见性回滚边界，不代表删除所有可能的 orphan object。

## 4. 普通撤回路径断言

演练通过正式 `OperationsDataService.withdrawVersion` 执行 platform-admin 撤回，并验证：

- author version、review submission、published artifact 和目录投影均切换为 `withdrawn`；项目没有其他可用版本时，项目投影也同步隐藏；
- withdrawal announcement 与 append-only audit 各一条；
- 新的 `/api/v1/downloads/artifacts/{id}` 返回 `404`；
- 搜索不再返回该项目；
- 已知 `/artifacts/{objectKey}` 仍返回 `200`，并带 `x-dawnlight-disposition: withdrawn`；
- 对象未被删除或换 key。

这不是安全事件下架。恶意包、版权、法律或凭据事件继续使用 WP9-2 的 `takedown`，其已知 URL 必须返回 `410` 并进入 evidence Worker。

## 5. 故障与恢复路径断言

故障场景使用第二个 approved submission：

1. Worker 停止并建立 outbox，确认 backlog；
2. 测试 ZIP 写入 quarantine 后停止 MinIO；
3. `/health/ready` 必须变为 `503`；
4. 启动 Worker，等待 publication run 记录 `infrastructure-error`；
5. 此时 published artifact、目录、feed snapshot 均为零，已知 URL 返回 `404`；
6. 恢复 MinIO，等待 pg-boss 原作业重试；
7. 最终至少保留一条失败 run，同时只有一条 completed run、一个 artifact 和一个 feed snapshot；
8. 恢复后的已知 URL 返回 `200` 且 hash 正确。

脚本在异常退出的 `finally` 中尽力恢复 MinIO 与 Worker，但不会掩盖原始失败。若恢复动作也失败，应由 operator 查看 Compose 状态，并只销毁整个 disposable project，不逐条删除审计记录。

## 6. 运行手册

前提：WP9-A 镜像已从当前工作树重新构建，Compose 已 `up -d --wait`，迁移到最新版本，公开端口能从执行主机访问。

如果重新生成了 `wp9-a.env`，必须先销毁同名 disposable project 的旧 volume，再启动；PostgreSQL 不会因环境文件中的密码变化而自动修改已初始化 volume：

```bash
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml down --volumes --remove-orphans
```

```bash
pnpm wp9:release:drill -- \
  --confirm DISPOSABLE-STAGING \
  --env-file infra/compose/wp9-a.env \
  --compose-file infra/compose/wp9-a.compose.yml \
  --report reports/wp9-a-release-drill.json
```

静态门禁与完整仓库检查：

```bash
pnpm wp9:stage-a:check
pnpm check
```

查看 Worker 与基础设施日志：

```bash
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml logs --since 15m worker api minio
```

演练完毕后销毁：

```bash
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml down --volumes --remove-orphans
```

`reports/` 已被 Git 忽略。正式变更记录只登记通过/失败、修订、时间和脱敏断言；不得提交环境文件、签名私钥、数据库 URL 或真实作者标识。

## 7. WP9-3 退出条件

- [x] 发布 prepared statement 在真实 PostgreSQL 上可执行；
- [x] 正常发布、目录、搜索、下载和 feed 的自动断言已实现；
- [x] ordinary withdraw 的新下载/已知 URL 差异已自动断言；
- [x] 队列积压、MinIO readiness、失败不可见和重试恢复已自动断言；
- [x] 报告明确降级为 engineering-only 且不包含 secret；
- [x] arch-vm 从本工作包源快照实际运行并登记结果；
- [ ] 真实 Loader timeout、CDN purge/deny、备份恢复和 Registry 候选证据——这些属于 WP9-B，不能在 WP9-A 勾选。

第一次真实发布的完整 Go/No-Go 条件见 [V2 第一次真实发布门禁](./V2-FirstRealRelease-Gate.md)。

## 8. arch-vm 实测记录

2026-08-21 在 `192.168.137.202` 使用 Docker 29.5.2、Compose 5.1.4 和 Node 26.2.0 完成 disposable WP9-A 演练。测试镜像来自以 `7ac52bec58e181800d4a7b9ebcab569a2d2a5f05` 为基线的 dirty 工作树快照，因此报告标记为 engineering-only，不能充当 clean commit 或 Registry 供应链证明。

最终报告 run ID 为 `2026-08-21-99793a1c76`，SHA-256 为 `7b1ecbff4155bcb8089701257c6dd62cb94a451e031082d6539d0ee084770c00`，六项检查全部通过：

| 检查 | 结果 | 关键证据 |
| --- | --- | --- |
| publication queue backlog | 通过，523 ms | Worker 停止时目标 submission 保留 1 个未调度 outbox |
| complete publication | 通过，2,688 ms | artifact/feed 各 1；公开 URL `200`；download resolver `302` |
| ordinary withdrawal | 通过，316 ms | 新下载 `404`；已知 URL `200 + withdrawn`；公告/audit 各 1；搜索中消失 |
| object storage readiness fault | 通过，209 ms | MinIO 停止后 API readiness `503` |
| failed publication visibility rollback | 通过，2,579 ms | failure run 1；artifact/directory/feed 均 0；已知 URL `404` |
| publication retry recovery | 通过，9,404 ms | failure run 1 + completed run 1；feed 1；公开 URL 恢复 `200` |

第一次运行在 ordinary withdraw 阶段发现：版本与 artifact 已撤回，但无剩余可用版本的项目仍可被搜索。修复后，withdraw 与 takedown 会在项目没有其他 available version 时同步隐藏项目投影，搜索查询也要求至少存在一个 available version；第二次完整运行通过。

环境启动还验证了一个运行手册边界：用新随机密码复用旧 PostgreSQL volume 会正确地认证失败；销毁明确命名的 disposable volume 后迁移从空库通过。Validator workspace 必须预先赋予容器 UID `10001` 和配置的 Docker GID 写权限。

演练后再次运行 Web/API/OIDC smoke，全部通过；Worker、API、PostgreSQL、MinIO、OIDC、Web 和 edge 达到 healthy。随后执行 `down --volumes --remove-orphans`，删除本次临时源目录、环境凭据和专用 Validator workspace，并确认不存在 `dawnlight-wp9-a_*` volume 或 network。
