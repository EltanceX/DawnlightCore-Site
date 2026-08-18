# V2-WP2：Contract ingest 与开发工具数据层

状态：代码与远端 Compose 运行演练完成；staging smoke 和生产签名仍待后续环境

日期：2026-08-18

上位方案：[V2 详细实现方案](./DawnlightCoreWebsiteV2ImplementationPlan.md)

前置记录：[V2-WP1 实现记录](./V2-WP1-Implementation.md)

## 1. 工作包边界

WP2 把 WP0 冻结的 Preview contract 转换为可校验、可重复导入、可查询的版本化只读数据层。它不实现账户、上传、审核、项目写 API、artifact 发布或真实 Loader 验证。

当前数据仍然是：

- Core commit `3ec28fc9461e6b1636ad4adc086e9cea8150c02e`；
- contract `preview-2026-08-16`；
- `preview-validated` / `preview-only`；
- `unsigned-preview`，不能用于 production activation；
- Graph 和 Variant 为 `unavailable`，没有虚构节点、边、define 或 Loader 结果。

## 2. Contract manifest、fixture 与锁定

### 2.1 新增机器合同

`contracts/dawnlight/preview/contract-manifest.json` 定义：

- contract ID、版本、状态、Core commit 和捕获时间；
- 生成器名称和版本；
- 每个原始数据集的相对路径、字节数、SHA-256、类别和可用状态；
- Schema、Diagnostic、Catalog、Capability、Graph、Variant、Diff 的可用性；
- `signature` envelope：支持 `ed25519` 签名，当前明确为 `unsigned-preview`。

`contracts/dawnlight/preview/ingest-fixture.json` 是 API 和静态 Web 工具共同消费的规范化快照，所有实体都携带：

- 稳定 `id` 或 `code`；
- contract 内版本；
- `status`；
- `sourceRef { path, pointer, commit }`；
- `deprecation`，为未来弃用和替代建议预留。

当前快照包含：4 个诊断、62 个 Catalog ID、2 个 Capability、2 个 Schema，以及明确 unavailable 的 Graph/Variant 记录。

`contracts/dawnlight/preview/contract-ingest-lock.json` 锁定 manifest/fixture 的 hash、期望行数、签名验证状态和“先校验、插入、最后原子激活”的策略。

### 2.2 生成与校验

```powershell
pnpm contract:sync
pnpm contract:ingest:build
pnpm validate:contract
pnpm validate:contract:ingest
```

`contract:sync` 仍然只从冻结 Core commit 的 git tree 导出资源，随后自动重建 ingest fixture。任何 dataset、manifest、fixture 或 lock hash 不一致都会失败。

生产环境要求已验证的 Ed25519 签名；没有生产 key 时只能在 development/test/preview 使用 unsigned snapshot。网站不把 hash 或 Preview lock 当作稳定公共 ABI。

## 3. Contract data service

新增 `packages/contract-data`：

- Zod 校验 `ContractManifest`、`ContractIngestLock` 和规范化 fixture；
- `loadContractBundle()` 校验相对路径、所有 dataset hash、manifest payload digest、lock hash、commit/version 一致性和签名策略；
- `createContractDataService()` 提供纯只读 service，支持内存 fixture 和多版本 diff；
- `loadContractDataService()` 为 Node/API 提供文件快照加载；
- 支持 Schema、Diagnostic、Catalog、Capability、Graph、Variant 和 Contract Diff 查询。

错误语义固定为：

| 情况 | code | HTTP |
| --- | --- | ---: |
| contract 版本不存在 | `ContractVersionNotFound` | 404 |
| ID 在当前版本不存在 | `ContractEntityNotFound` | 404 |
| ID 只存在于其他 contract 版本 | `ContractVersionConflict` | 409 |
| Catalog ID 同时属于多个 kind | `ContractIdentifierConflict` | 409 |
| 已弃用实体被直接查询 | `ContractEntityDeprecated` | 410 |
| Graph/Variant 数据集明确不可用 | 返回实体 `status=unavailable` | 200 |

这样可以避免用前端猜测跨版本含义，也不会把缺少 Loader 输出误报为验证失败或成功。

## 4. 数据库版本化表与原子 ingest

新增迁移 `packages/database/migrations/0002_contract_ingest.sql`，包含：

- `contract_versions`：版本、source commit、manifest hash、签名状态、active 标记；
- `contract_schemas`；
- `contract_diagnostics`；
- `contract_catalog_entries`；
- `contract_capabilities`；
- `contract_graphs`；
- `contract_variants`；
- `contract_ingest_runs`。

`ingestContractBundle()` 使用事务和 advisory lock：

1. 读取当前 active 版本；
2. 对已存在版本比较 manifest hash；
3. 新版本先插入全部实体；
4. 所有插入成功后才关闭旧 active 并激活新版本；
5. 记录 `activated` 或幂等的 `unchanged` ingest run；
6. 任一错误执行 rollback，当前 active 数据不受影响。

执行入口：

```powershell
pnpm db:migrate
pnpm db:contract:ingest
```

`createPostgresContractDataService()` 将数据库中的版本化行重建为同一 `ContractDataService` 形状，API 因而不会暴露 PostgreSQL model。

## 5. API 与 OpenAPI DTO

`contracts/openapi/v1.yaml` 已从 WP1 health bootstrap 扩展为 V2-WP2 只读 API：

```text
GET /api/v1/contracts
GET /api/v1/contracts/{contractVersion}
GET /api/v1/contracts/{contractVersion}/diagnostics
GET /api/v1/contracts/{contractVersion}/diagnostics/{code}
GET /api/v1/contracts/{contractVersion}/catalog?kind=
GET /api/v1/contracts/{contractVersion}/catalog/{kind}/{id}
GET /api/v1/contracts/{contractVersion}/capabilities
GET /api/v1/contracts/{contractVersion}/capabilities/{id}
GET /api/v1/contracts/{contractVersion}/graph
GET /api/v1/contracts/{contractVersion}/variant
GET /api/v1/contracts/diff?from=&to=
```

`packages/api-client/src/generated.ts` 由 `openapi-typescript` 生成，`src/index.ts` 只导出 DTO 别名和 `paths/operations` 类型。API 返回统一 `{ data }` 或已有 error envelope。

所有只读响应设置版本化缓存策略和 ETag：

```text
Cache-Control: public, max-age=60, s-maxage=86400, stale-while-revalidate=604800
ETag: "<sha256 response payload>"
```

条件请求命中时返回 304。API 运行时默认使用 fixture，`CONTRACT_DATA_SOURCE=database` 时从 PostgreSQL 已导入快照读取；两者共享相同的规范化类型。

## 6. 静态开发工具接入

`apps/web/src/lib/developer-tools.ts` 已改为消费 `ingest-fixture.json`，不再分别读取 Catalog 和 diagnostics 原始 JSON。这样 API fixture 和静态构建 fallback 共享同一套稳定 ID、sourceRef、状态和 digest。

Pipeline/Variant 页面读取数据层的 unavailable 记录；页面不会自行生成 graph、defines 或 variant 结果。WP3 再把这些页面改为版本切换、筛选、深链和 API 优先的交互体验。

## 7. 验证记录

本机已通过：

- `pnpm install`，workspace 现在为 8 个项目；
- `pnpm typecheck`；
- `pnpm validate:contract`；
- `pnpm validate:contract:ingest`；
- `pnpm v2:check`；
- `pnpm --filter @dawnlight/contract-data test`：3 tests passed；
- `pnpm --filter @dawnlight/api test`：3 tests passed；
- `pnpm services:build`；
- `pnpm api:smoke`：health 200/503、contract diagnostics 200；
- `pnpm format:check`；
- OpenAPI YAML、manifest、fixture 和 ingest lock 校验。

本机没有 Docker CLI，但已在授权的 `arch-vm`（`192.168.137.202`）完成远端运行验证，未保存登录凭据：

- PostgreSQL/MinIO Compose 服务均为 `healthy`；
- migration、seed 和 contract ingest 实际连接成功；
- ingest 首次 `activated`、第二次 `unchanged`，验证了幂等和激活路径；
- database-mode API 的 health 和 diagnostics endpoint 已通过；
- MinIO live/ready healthcheck 已通过 HTTP 200。

仍未执行：

- staging API 和生产签名验证；
- 真实 CLI 的 Graph/Variant/Loader JSON 输出。

## 8. 退出条件

- [x] manifest、签名 envelope 和 ingest lock 已定义；
- [x] Schema、Catalog、Diagnostic、Capability、Graph、Variant 已有版本化规范化记录；
- [x] 稳定 ID、版本、状态、sourceRef、deprecation 字段已固定；
- [x] 只读 service、OpenAPI DTO、错误语义、ETag 和缓存策略已实现；
- [x] API 与静态工具 fallback 消费同一 normalized fixture；
- [x] ingest 失败不会覆盖当前 active 版本的事务策略已实现并有测试入口；
- [x] 真实 PostgreSQL/MinIO migration、ingest 幂等和 database-mode API 运行演练；
- [ ] staging 部署 smoke；
- [ ] 生产签名 key、稳定 CLI 和真实 Loader contract。

## 9. 后续交接

V2-WP3 已完成 Developer Tools 前端，记录见 [V2-WP3 实现记录](./V2-WP3-Implementation.md)。下一步进入 V2-WP4，只读目录仍复用本工作包的版本、sourceRef、错误 envelope 和缓存边界。
