# V2-WP8：搜索、下载统计与运营控制台

状态：工程实现完成，PostgreSQL 16.4 migration 与数据服务已在 arch-vm Compose 环境通过 smoke；多实例限流、对象存储容量采集、数据权利 SOP 和真实运营演练仍属于上线门禁。

## 1. 目标与边界

WP8 为 WP7 的审核发布闭环增加三类能力：公开且可解释的跨域搜索、最小化下载统计，以及仅平台管理员可见的运营控制台。运营人员可以发现下载/验证/队列异常，进入独立审核队列，处理举报，撤回已发布版本，并隐藏或封禁目录项目。

本工作包不开放社区主页、用户行为推荐或个人下载画像。静态 Preview 不加载私有 fixture；未配置 `NEXT_PUBLIC_API_ORIGIN` 时，运营页只显示“运营 API 尚未配置”。运营 API 使用 `private, no-store`，页面 metadata 使用 `noindex, nofollow`。

## 2. 搜索数据层

`0007_search_operations.sql` 启用 `pg_trgm`，为目录项目、版本、artifact 文件名，以及 Contract diagnostic、Catalog、capability 建立 GIN trigram 索引。`PostgresSearchDataService` 将五类结果归一为同一响应：

```text
project | version | diagnostic | catalog | capability
  -> id/title/summary/url/version/status/core/gameApi
  -> stable order + base64url offset cursor
  -> at most 50 records
```

支持 `contractVersion`、Core commit 前缀、Game API、platform、architecture、GPU class、channel 和 license facet。项目/版本结果只读取 `published + available`；facet 也从相同公开集合计算，隐藏、封禁、候选和撤回项目不能借 facet 泄漏元数据。Contract 搜索只读取 active 且非 unavailable 的 contract。

`GET /api/v1/search` 返回 ETag，并使用短缓存加 `stale-while-revalidate`。搜索输入会做长度限制，数据库始终使用参数化查询。

## 3. 下载统计与隐私

公开下载入口为 `GET /api/v1/downloads/artifacts/{artifactId}`。服务端仅解析 `available` artifact，写入小时 bucket 后 302 到发布 URL，并返回 `X-Content-SHA256`。不存在或撤回 artifact 返回稳定的 `ArtifactNotFound`，同时只记录错误类别，不保存请求 URL 或原始包正文。

原始事件字段限制为：小时 bucket、artifact/version 引用、32 字符以内的粗粒度 edge、`direct/referral/client/unknown` 来源类、结果/状态码和错误类。可选事件 ID 只用于幂等去重，入库前先做 SHA-256，不保存调用方原值。统计链路不写账户 ID、cookie、User-Agent、Referer、完整 IP、精确位置或任意营销标识。

`dawnlight.download-retention.v1` 由 Worker 每小时调度。`DOWNLOAD_EVENT_RETENTION_DAYS` 默认 90 天，范围 1～3650 天；清理以 `created_at` 为准。下载事件只能用于容量、可靠性和 artifact 热度聚合，不得与 OIDC 用户、作者项目成员或举报联系信息关联。

## 4. 运营指标与动作

`GET /api/v1/ops/overview` 聚合 1～31 天窗口内的数据：

- 成功/错误下载、下载过的 artifact 数和 Top 10 artifact；
- Loader 各状态计数，以及通过、Loader 失败、安全失败和超时构成的验证失败率；基础设施错误不混入内容失败率；
- preflight、Loader、publication 和 review 队列积压；
- 最近 24 小时下载错误类别；
- published 对象/字节和 quarantine 声明对象/字节。

S3 API 无法提供后端总容量时，`capacityBytes` 明确返回 `null`，UI 显示 metadata-only，不推断剩余容量。

运营动作包括：

- 举报/版权请求：公开创建，管理员按 received、in-review、resolved、rejected 处理；
- 审核：控制台直达作者工作区的独立 reviewer queue，继续沿用 WP7 的不可自审、冻结 metadata 和不可变决定；
- 撤回：事务中撤回 author version、published artifact、review submission 和目录投影，并创建 withdrawal announcement；
- 项目治理：hide/unhide/ban/unban 改变目录公开状态并写 `moderation_actions`；
- 所有运营写操作要求有效管理员 session、Origin、CSRF 和 `Idempotency-Key`，并写 append-only audit。

运营界面不提供 quarantine 下载、原始 ZIP 浏览、对象存储凭据或签名 URL。

## 5. 限流与部署拓扑

API 对搜索、下载、上传、OIDC 登录和举报分别配置窗口限流，超限返回 `429 RateLimited`、稳定错误 envelope 和 `Retry-After`。当前实现是单进程内存窗口，键为请求 IP，窗口结束后清除且不持久化。

该实现适合单实例开发、Preview 和功能验证。任何多实例 staging/production 必须在 ingress/CDN 或共享 Redis/Valkey 层实现同语义限流，并验证可信代理链和 `TRUST_PROXY`；否则不同实例的计数不一致。边缘层不得把完整 IP 回写业务数据库。

## 6. 保留、导出与删除设计

| 数据 | 默认保留 | 导出 | 删除/匿名化 |
| --- | --- | --- | --- |
| 下载原始事件 | 90 天 | 仅按 bucket/artifact 的聚合 CSV/JSON | Worker 自动硬删除 |
| 聚合运营报表 | 尚未持久化 | API 即时生成 | 随原始事件过期自然不可重算 |
| 举报与版权请求 | 策略待批准 | 仅授权运营导出个案 | 完结并超过法务保留期后移除 contact，保留最小审计事实 |
| 账户/团队数据 | 继承 WP5 | 通过受认证账户导出任务 | deletion request 异步执行，法定审计记录以替代 ID 去标识化 |
| 审核、撤回、封禁审计 | 运营政策待批准 | 管理员审计导出 | 不静默改写；到期按批准 SOP 删除或去标识化 actor |

实现生产导出/删除 Worker 前必须冻结：数据控制者、请求认证方式、响应 SLA、法务保留期、备份中的删除传播、导出加密与下载过期、审计留存例外。导出任务不能包含原始 IP，因为业务库从未保存该字段；下载聚合不能按用户、会话或设备切片。

## 7. 验证证据

新增 `pnpm db:operations:smoke`。脚本创建随机且可清理的公开/隐藏 fixture，在真实 PostgreSQL 上验证：

- migration `0001`～`0007` 与 `pg_trgm` 索引可创建；
- 项目/版本搜索与 compatibility/license filter；
- 隐藏项目不进入结果或 facet；
- 下载解析、事件 ID hash 去重、404 错误聚合；
- 管理员概览、举报列表和过期事件清理。

API 回归覆盖 ETag、302/SHA header、公开举报、管理员权限、Origin 拒绝和 429/`Retry-After`。静态构建、Playwright 和 axe 覆盖 `/zh-CN/ops/` 的无私有 fixture 状态。

arch-vm 验证环境（2026-08-18）：PostgreSQL 16.4 与 MinIO Compose healthy，现有数据库从 `0002` 顺序升级到 `0007`，contract/directory seed 成功，WP8 PostgreSQL smoke 通过。该证据不等同于完整 API/Worker staging 或生产就绪。

## 8. 退出条件审计

| 条件 | 当前结果 |
| --- | --- |
| 项目、版本、diagnostic、Catalog 搜索和 facet | 已实现并通过真实 PostgreSQL smoke |
| 下载统计最小化、去重和自动保留 | 已实现；事件 ID 入库前 hash |
| 热门、失败率、队列、错误和存储 dashboard | 已实现；总容量未知时为 null |
| reviewer、举报、撤回、公告和封禁 | 已接入现有审核队列；其余操作有审计和幂等保护 |
| 不访问原始包即可完成日常运营 | UI/API 边界已实现 |
| 多实例分布式限流 | 待 WP9 部署拓扑冻结 |
| 数据权利/法务 SOP 与真实运营演练 | 待责任人审批和 WP9 演练 |

因此 WP8 的代码退出条件已满足；是否进入 Beta 仍由 WP9 的独立 staging、故障/撤回演练、政策责任人和真实参与者任务观察决定。
