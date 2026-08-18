# V2-WP1：动态工程骨架与环境隔离

状态：骨架完成；本地依赖运行演练待 Docker 环境

日期：2026-08-18

上位方案：[V2 详细实现方案](./DawnlightCoreWebsiteV2ImplementationPlan.md)

前置记录：[V2-WP0 实现记录](./V2-WP0-Implementation.md)

## 1. 本工作包目标

WP1 将 V2 从纯 Web 静态工程扩展为可以承载 API、Worker 和数据库的 TypeScript workspace，同时保证 V1 静态门户在 API 不可用时仍可构建和访问。

本工作包只实现启动、配置、健康检查、迁移入口和本地依赖隔离，不实现项目、账户、上传、审核或 Loader 验证业务。

## 2. 已交付

### Workspace

- `pnpm-workspace.yaml` 增加 `packages/*`；
- 新增 `apps/api`、`apps/worker`；
- 新增 `packages/config`、`packages/database`、`packages/api-client`；
- root `typecheck` 会先构建共享包，再检查 Web/API/Worker；
- root `test` 增加 API health shell 测试；
- `v2:check` 检查骨架文件、workspace、Compose、OpenAPI 和 `.env.example`。

### API shell

`apps/api` 当前使用 Fastify transport shell，提供：

- `GET /health/live`：进程存活检查，不访问数据库；
- `GET /health/ready`：检查注入的数据库和对象存储探针，依赖失败返回 `503`；
- `x-request-id` 复用或生成请求 ID；
- Pino 结构化日志；
- OpenTelemetry active span 的 request ID 属性接入点；
- CORS、trust proxy 和端口由环境变量控制；
- 统一 `InternalError` envelope，不向客户端返回异常栈。

健康 API 的 bootstrap 合同位于 [`contracts/openapi/v1.yaml`](../contracts/openapi/v1.yaml)，共享响应类型位于 `packages/api-client`。业务 API 不在本工作包中声明。

### Worker shell

`apps/worker` 当前只建立：

- `pg-boss` 队列连接工厂；
- 固定的 `dawnlight.validation.v1` 队列名称；
- 配置检查命令；
- 最小启动入口和优雅停止信号。

Worker 尚未消费上传、验证或发布任务。

### Database package

`packages/database` 当前提供：

- PostgreSQL pool 工厂和 `select 1` 健康检查；
- `0001_runtime.sql`，创建 `schema_migrations` 和最小 `runtime_instances` 运行记录表；
- 幂等 `migrate:up` 命令；
- 本地 seed 命令；
- 不包含项目、版本、artifact、用户和审核表，这些属于后续 WP2/WP4/WP5。

### 本地环境

`infra/compose/v2-dev.compose.yml` 提供：

- PostgreSQL 16.4，映射到 `127.0.0.1:55432`；
- MinIO S3 API `127.0.0.1:59000` 和 Console `127.0.0.1:59001`；
- 独立命名 volume 和 healthcheck；
- 仅本地默认凭据，不包含生产 secret。

`.env.example` 增加 API、数据库、对象存储、CORS、OpenTelemetry 和日志配置。staging/production 不得复制本地 secret 或 bucket。

## 3. 本地使用

复制环境文件后，若本机有 Docker：

```powershell
Copy-Item .env.example .env
docker compose -f infra/compose/v2-dev.compose.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm --filter @dawnlight/api dev
```

另一个终端可以检查：

```powershell
Invoke-WebRequest http://127.0.0.1:4100/health/live
Invoke-WebRequest http://127.0.0.1:4100/health/ready
pnpm --filter @dawnlight/worker check:config
```

本机开发环境没有 Docker CLI；本轮已在授权的 `arch-vm`（`192.168.137.202`）完成远端 Compose 运行演练，未在仓库或日志中保存登录凭据。

## 4. 环境隔离规则

| 环境 | 数据库 | Object Storage | Secret |
| --- | --- | --- | --- |
| development | 本地 Compose | 本地 MinIO | `.env`，不提交 |
| test | 测试数据库或临时容器 | 测试 bucket/prefix | CI secret 或 ephemeral credential |
| staging | 独立 provider/project | 独立 quarantine/published/derived bucket | 独立 secret namespace |
| production | 生产 PostgreSQL | 生产 bucket + CDN | 生产 secret manager |

任何环境不得共享生产数据库、published bucket、OIDC client 或签名密钥。Worker 的生产权限必须小于 API，不能拥有任意生产数据库写权限。

## 5. 验证记录

已通过：

- `pnpm install`，workspace 共 7 个项目；
- `pnpm v2:check`；
- `pnpm typecheck`；
- `pnpm services:build`；
- `pnpm api:smoke`：live 200、依赖失败 ready 503；
- `pnpm --filter @dawnlight/api test`：2 tests passed；
- `pnpm check`：全量格式、类型、构建、契约、静态输出、安全、E2E 和 Lighthouse 检查通过；
- Prettier 和 OpenAPI/Compose YAML 结构校验。

远端 `arch-vm` 运行记录（2026-08-18）：

- `docker compose -f infra/compose/v2-dev.compose.yml up -d` 成功；PostgreSQL 和 MinIO 均为 `healthy`；
- `pnpm db:migrate` 首次应用 `0001_runtime`、`0002_contract_ingest`，第二次幂等通过；
- `pnpm db:seed` 成功；
- `pnpm db:contract:ingest` 首次返回 `activated`，第二次返回 `unchanged`；
- PostgreSQL 记录为：2 migrations、1 runtime instance、1 contract version、2 schemas、4 diagnostics、62 catalog entries、2 capabilities、1 graph、1 variant、2 ingest runs；
- MinIO `/minio/health/live` 和 `/minio/health/ready` 均返回 HTTP 200；
- API `CONTRACT_DATA_SOURCE=database` 模式启动成功，live 200、ready 200、contract diagnostics 200。

仍未执行：

- Worker staging 部署和真实 OpenTelemetry exporter；
- 生产环境签名和真实对象存储 bucket 策略。

## 6. 退出条件

- [x] 空 API/Worker/database/client 模块可被 workspace 识别；
- [x] 环境变量有集中 schema 和 `.env.example`；
- [x] API health 能区分依赖可用与故障；
- [x] 迁移入口具备幂等记录表；
- [x] 本地 Compose、OpenAPI bootstrap 和验证脚本已加入仓库；
- [x] V1 Web 在 API 不存在时仍能通过原有静态构建；
- [ ] Docker 运行时、迁移恢复、MinIO bucket 初始化和 staging smoke 待后续环境执行。

## 7. 下一工作包

V2-WP2 已在这个骨架上定义 `contract-manifest.json`、ingest lock、只读 contract 数据表、OpenAPI DTO 和 contract ingest service。后续 V2-WP3 只扩展工具页交互，不应提前创建上传、账户或审核表，也不应把当前 Preview contract 升级为稳定 ABI。
