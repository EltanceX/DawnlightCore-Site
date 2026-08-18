# V2-WP6：Quarantine 上传与预检 Worker

状态：实现完成（本地代码与自动化 fixture 已验证；真实 MinIO/PostgreSQL/pg-boss Compose 演练仍需在具备 Docker CLI 的环境执行）。

## 目标与非目标

WP6 为作者草稿提供“浏览器直传隔离区 -> 服务端 HEAD 确认 -> Worker 预检 -> 私有状态查询”的闭环。API 不接收文件正文，不信任浏览器提交的 hash/size，不产生公开下载 URL。通过预检的对象仍留在 quarantine，发布桶 copy、Loader 验证、审核和签名 feed 属于 WP7。

## 状态机

```text
created --complete(HEAD)--> queued --> inspecting --> passed
                                      |              \
                                      |               -> rejected --expiry cleanup--> expired
                                      -> infrastructure-error (retry/dead-letter)
created --TTL cleanup-----------------------------------------------> expired
```

`upload_sessions` 和 `preflight_runs` 在 `packages/database/migrations/0005_upload_preflight.sql` 中定义。`upload_job_outbox` 保证 API 在队列暂时不可用时不会丢任务；API/Worker 启动时会补投未 dispatch 的 outbox 项。

## API 合同

受保护端点：

* `POST /api/v1/author/projects/{projectId}/versions/{versionId}/uploads`：校验作者 session、精确 Origin、CSRF、幂等键、项目 owner/maintainer 角色、单层 `.zip` 文件名和声明大小，返回仅针对一个服务端生成 object key 的短时效 PUT URL。响应不含 object key、storage 凭据或公开 URL。
* `POST /api/v1/author/uploads/{uploadId}/complete`：服务端以 MinIO `HeadObject` 的 Content-Length/Content-Type/ETag 为唯一证据，原子地把状态改为 `queued` 并写入 outbox。请求体中的 hash/size（即使未来扩展）不会被作为证据使用。
* `GET /api/v1/author/uploads/{uploadId}`：仅项目 owner、maintainer、reviewer 可读，使用 `private, no-store`，返回预检清单摘要和诊断，不返回 object key 或签名 URL。

生成 URL 使用 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`，MinIO 使用 `forcePathStyle`。创建响应中的 URL 只保留在浏览器内存中，前端不会写入 localStorage、URL query 或日志。

## Worker 安全边界

`apps/worker/src/preflight.ts` 使用 `mkdtemp` 创建一次性 0700 临时目录，并在 `finally` 中删除。对象以 async iterable 流式写入，受 `UPLOAD_MAX_BYTES` 限制；API 内存不会随包大小增长。

ZIP 检查规则：

* 规范化 `/`，拒绝 NUL、绝对路径、盘符、`..`、目录条目和规范化后重复路径（大小写无关）；
* 根据 Unix external attributes 拒绝 symbolic link、block/char device 和 FIFO；
* 限制条目数、单条目和总解压大小、压缩比；
* 仅允许 shader 包约定的 JSON/GLSL/着色器扩展、PNG/JPEG/WebP 及少量文本扩展；
* JSON 在解析前限制字节数，并限制深度、键数和键长度；
* 图片只读取小型头部/受限内容，校验签名、尺寸和像素上限，不进行无界解码；
* 对原始 ZIP 和每个清单条目分别计算 SHA-256。

清单按规范化路径排序，因而同一输入可产生可重复报告。内容安全拒绝不会重试；S3、数据库、损坏下载和超时属于基础设施错误，使用 pg-boss 有限指数退避。达到上限后写入 `preflight_dead_letters`，并在保留期后由 `dawnlight.quarantine.cleanup.v1` 删除对象并把会话标记为 `expired`。

## 队列与运行限制

* `dawnlight.preflight.v1`：`singletonKey=uploadId`、单并发、`PREFLIGHT_RETRY_LIMIT`、`PREFLIGHT_TIMEOUT_SECONDS`、死信队列；
* `dawnlight.quarantine.cleanup.v1`：删除失败/过期 quarantine 对象；
* `dawnlight.preflight.dead-letter.v1`：仅保留任务元数据，不保存包正文。

CPU、内存、无网络、非 root、只读根文件系统属于 Worker 容器/部署层门禁；本提交把应用层超时、文件数、字节、压缩比和临时目录清理固定下来。真实生产容器与 Loader 隔离在 WP7/WP9 验收。

## 测试覆盖

`apps/worker/src/preflight.test.ts` 覆盖：

* 正常最小 shader ZIP 的确定性清单和服务端 SHA-256；
* `../`、绝对路径、重复规范化路径、非法扩展名；
* ZIP 高压缩比；
* 超大 JSON；
* 非法图片头；
* 临时目录运行后清理（通过重复运行报告稳定性间接验证）。

API 现有 WP5 测试继续验证未配置作者依赖时的静态健康与鉴权；端点合同同步至 `contracts/openapi/v1.yaml` 并重新生成 `packages/api-client/src/generated.ts`。在具备 Compose 的环境还应补跑 MinIO HEAD/PUT、PostgreSQL migration、pg-boss retry/dead-letter 和真实 bucket policy smoke。

### arch-vm Docker 演练（2026-08-18）

已在 `192.168.137.202`（Docker 29.5.2、Compose 5.1.4）使用隔离项目名 `dawnlight-wp6-test` 完成基础设施 smoke：

* `docker compose ... config --quiet` 通过；由于 VM 上已有服务占用默认端口，演练临时将宿主端口映射为 `65000`（MinIO API）、`65001`（MinIO Console）、`65002`（OIDC）、`65032`（PostgreSQL），未触碰原有项目；
* PostgreSQL 16.4、MinIO、mock OIDC 均启动，MinIO health 为 HTTP 200，OIDC discovery 为 HTTP 200；
* `0001`–`0005` migration 全部执行成功，`upload_sessions` 与 `preflight_runs` 表可查询；
* `minio-init` 以退出码 0 创建 `dawnlight-quarantine`、`dawnlight-published`、`dawnlight-derived`，并将三者 anonymous policy 设置为 `private`；匿名访问 quarantine 对象返回 HTTP 403；
* `minio/mc` sidecar 固定为可用的 `RELEASE.2024-11-21T17-21-54Z` 标签（原 `2024-06-13` 标签不存在）。

本次只验证依赖容器、迁移和 bucket 安全边界；API/Worker 应用容器未纳入该开发 Compose，真实 S3 直传、pg-boss 消费和 Loader 隔离仍需在带应用镜像的 staging 演练中验收。

## 变更清单

* 配置：上传 URL/session TTL、大小/解压/文件数/JSON/图片/压缩比/超时/重试/回收上限；
* 数据库：`0005_upload_preflight.sql`、上传和预检服务；
* API：S3 presign、HEAD complete、私有状态 DTO、outbox 投递；
* Worker：S3 流下载、受限 ZIP 检查、报告持久化、重试/死信/cleanup；
* Web：作者版本草稿内的隔离区直传和预检诊断展示；
* Compose：MinIO 三个私有 bucket 初始化且全部禁止匿名访问；
* OpenAPI、API client、V2 workspace validation 和本文件。

## 退出条件审计

| 条件 | 结果 |
| --- | --- |
| 危险 fixture 被拒绝 | 已由 Worker Vitest 覆盖 |
| 正常包生成可重复报告 | 已由 Worker Vitest 覆盖 |
| API 不接收大文件 body | API 仅 JSON 创建/完成；正文直传对象存储 |
| quarantine 不产生公开 URL | 公开目录/DTO 不读取上传 object key；bucket 初始化为 `anonymous none` |
| 真实 Compose 演练 | arch-vm 基础设施 smoke 已通过；应用镜像级 staging 演练待后续 |
