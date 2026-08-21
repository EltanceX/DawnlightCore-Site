# V2-WP9-2：两级 staging 的第一层

状态：第一层（WP9-A）工程实现完成；arch-vm disposable staging 演练结果记录于本文第 9 节。第二层 WP9-B 仍未开始，不能据此宣称 Beta 已发布

## 1. 工作包定位

两级 staging 的职责保持分离：

| 层级 | 环境 | 目标 | 是否接触真实作者 |
| --- | --- | --- | --- |
| 第一层 WP9-A | 隔离 arch-vm、Compose、mock OIDC、测试密钥和 disposable 数据 | 验证镜像、迁移、完整服务拓扑、紧急下架、已知 URL 阻断、证据保留和自动门禁 | 否 |
| 第二层 WP9-B | 独立真实 provider、OIDC client、Registry digest、TLS/CDN、secret manager 和受控值班清单 | 验证真实供应链、CDN purge/deny、备份恢复、故障演练和参与者任务 | 邀请制，门禁通过后才允许 |

WP9-1 交付了第一层的部署制品；WP9-2 使第一层具备可以验证安全事件闭环的业务能力。WP9-A 通过不会自动满足 WP9-B。

## 2. 第一层退出范围

本工作包要求：

1. 只新增 `0008+` migration，不修改已提交的 `0006`、`0007`；
2. 普通 `withdraw` 和紧急 `takedown` 保持不同语义；
3. takedown 仅允许 platform-admin，且同时要求 session、Origin、CSRF、幂等键和逐字二次确认；
4. 数据库事务提交时，目录、下载入口和已知 artifact URL 同时被阻断；
5. 已知 URL 在第一层返回 `410`，对象存储不直接暴露宿主机端口；
6. takedown 决定 append-only，并保留 digest、大小、对象键、actor、类别和请求 ID；
7. Worker 将公开对象复制到受限 evidence 前缀、核验大小与 SHA-256 metadata，之后删除 published 对象；
8. evidence 任务失败可重试，运营视图能看到队列积压；
9. disposable 数据库演练验证状态转换、审计、410 和 outbox。

## 3. 撤回与紧急下架语义

| 行为 | 权限 | 目录/新下载 | 已知 URL | 对象处理 |
| --- | --- | --- | --- | --- |
| `withdraw` | 作者维护者或 platform-admin | 下架 | 在保留期内仍可访问 | published 对象保留 |
| `takedown` | 仅 platform-admin | 立即下架 | 立即 `410 Gone` | 异步移入受限 evidence，随后删除 published 副本 |

作者不能通过 withdraw 获得 takedown 权限。普通撤回也不能意外删除不可变历史。

## 4. 数据模型

`0008_takedown_staging.sql` 增加：

- `taken-down` 状态：author version、review submission、published artifact 和目录投影同步使用；
- `takedown_decisions`：append-only 决定记录，保存最小事件证据和公开公告；
- `takedown_evidence_outbox`：只保存证据工作状态、受限对象键、失败摘要和调度次数；
- moderation action `takedown`：让运营动作进入既有审计查询边界。

私有原因不进入公开错误、下载响应或静态站。`takedown_decisions` 禁止 update/delete；证据处理状态独立存放，避免 Worker 为更新进度而修改原始决定。

## 5. API 与已知 URL 阻断

紧急操作：

```http
POST /api/v1/ops/versions/{versionId}/takedown
Origin: <CORS_ORIGIN>
X-CSRF-Token: <session csrf>
Idempotency-Key: <unique key>
```

请求体：

```json
{
  "category": "security",
  "privateReason": "受控运营说明，至少 10 字符。",
  "publicNotice": "该版本在安全复核后暂不可用。",
  "confirmation": "TAKEDOWN <versionId>"
}
```

API 在一个事务中写入不可变决定、切换所有公开状态、创建 evidence outbox、记录 moderation action 和 append-only audit。只有事务成功后返回决定 ID；重复幂等请求返回相同结果，不会生成第二个决定。

发布 URL 统一经过 `/artifacts/*` gateway：

- `available`：提供对象；
- `withdrawn`：已知 URL 在保留期内仍提供对象；
- `taken-down`：在读取对象存储之前返回 `410`；
- 未知对象：返回 `404`。

WP9-A Caddy 将 `/artifacts/*` 代理到 API，MinIO 不发布宿主机端口。第一层强制 `Cache-Control: no-store`，因此不存在需要 purge 的本地 edge cache；WP9-B 必须替换为真实 CDN 的精确 purge/deny，并单独验证缓存清除证据。

## 6. evidence Worker

队列名为 `dawnlight.takedown-evidence.v1`。处理顺序固定：

1. 将 published 对象复制到 derived bucket 的 `takedown-evidence/{decisionId}/{sha256}.zip`；
2. HEAD evidence 对象并核对长度与 SHA-256 metadata；
3. 删除 published 对象；
4. 把 outbox 标记为 `retained`。

重试时先 HEAD 已存在的 evidence，因此“复制成功、数据库确认失败”不会因为 published 源已删除而丢失证据。最终失败保留 `failed` 状态和截断的基础设施摘要，必须由运营人员处理，不能回滚公开阻断。

## 7. 自动门禁

```bash
pnpm wp9:stage-a:check
pnpm test
pnpm check
```

`wp9:stage-a:check` 检查：

- `0008`、append-only decision、evidence outbox；
- platform-admin、幂等、410、公开 gateway 和 no-store；
- evidence 核验后删除；
- WP9-A Caddy 路由、private internal 网络和 MinIO 无宿主机端口；
- OpenAPI 与实现边界一致。

Worker 单测覆盖成功保留与最终失败记录；API 测试覆盖受控 artifact 获取、合法 takedown 和旧 URL 变为 410。

## 8. disposable 数据库演练

只能对明确可销毁的第一层数据库执行：

```bash
export DATABASE_URL='postgres://.../dawnlight_wp9_a'
export WP9_A_DRILL_CONFIRM=DISPOSABLE-STAGING
pnpm db:migrate
pnpm wp9:takedown:smoke
```

演练会创建带唯一 ID 的 operator、project、version、validation、review、artifact 和目录记录，然后验证：

- artifact 在事件前可解析；
- takedown 原子切换 author、published、review 和目录状态；
- 同一对象随后抛出 `ArtifactTakenDown/410`；
- append-only audit 恰好存在一条允许记录；
- evidence outbox 可被 Worker 调度；
- 修改原始决定被数据库 trigger 拒绝。

脚本有意保留不可变审计证据，因此拒绝在未设置显式确认变量时运行。完成后应销毁整个 WP9-A Compose volume，而不是删除单条事件。

## 9. arch-vm 证据

2026-08-21 在 `192.168.137.202` 使用独立 Compose project `dawnlight-wp9-2` 完成了一次 disposable WP9-A 闭环演练：

- Docker Hub 恢复可访问，固定 Node 基础镜像可按 digest 拉取；
- PostgreSQL 从既有 migration 顺序执行到 `0008_takedown_staging.sql`；
- Web、API、Worker、edge、PostgreSQL、MinIO 和 mock OIDC 全部达到 healthy，Web/API/OIDC smoke 通过；
- 向私有 published bucket 写入 24 B 测试对象，SHA-256 为 `53eea4b494d119bca8f32ed04ed798890ec323b41e9030a2727b4265010d939e`；
- 对象在事件前通过公开 gateway 返回 `200`；platform-admin takedown 在数据库侧 15 ms 内完成原子阻断、审计和 evidence outbox；
- 同一已知 URL 随后返回 `410 ArtifactTakenDown` 和 `Cache-Control: no-store`；
- Worker 将对象转存到 `takedown-evidence/{decisionId}/{sha256}.zip`，HEAD 结果确认大小为 24 B，并带 `restricted-takedown-evidence` disposition 与原 SHA-256 metadata；
- outbox 最终为 `retained`，published bucket 中的原对象已不存在，已知 URL 仍保持 `410`；
- 演练结束后执行 `docker compose down --volumes --remove-orphans`，并确认 `dawnlight-wp9-2_*` 命名卷和网络均已移除。

真实演练同时发现并修复了两类仅靠 mock 难以发现的问题：带参数的多语句 prepared statement 被 PostgreSQL 拒绝，以及 410 错误分支最初缺少 `no-store`。当前实现把状态更新拆为同一事务内的独立语句，并在进入 artifact gateway 时预先设置缓存策略；相应断言已进入 API 测试和演练脚本。

本次远端镜像来自工作树快照，环境文件明确标记为基于 `90bc056` 的 `dirty WP9-A test only`，因此只证明第一层功能闭环，不构成候选制品或 WP9-B 供应链证明。WP9-B 仍必须从精确 clean commit 产生 Registry digest、SBOM、provenance 和 attestation。

## 10. 尚未满足的第二层门禁

- Web/API/Worker/Validator 的 Registry manifest digest 和供应链证明；
- 独立真实 staging provider、OIDC、TLS、CDN 和 secret manager；
- CDN 精确 purge/deny API 及 15 分钟确认、60 分钟公开阻断计时证据；
- rootless Validator runner 或受限 socket proxy；
- 备份恢复、队列积压、对象存储故障和回滚演练；
- 六类运营角色的实名 primary/backup 清单；
- 真实维护者和作者的邀请制任务观察与签字。

下一步应进入 WP9-3：完善第一层端到端发布/撤回/故障演练并生成可审计报告，随后才准备 WP9-B 真实 staging。
