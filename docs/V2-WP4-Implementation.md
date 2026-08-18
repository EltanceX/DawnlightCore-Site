# V2-WP4：只读目录与兼容性推荐

状态：Preview 只读目录第一批实现完成；维护者 seed/import、真实 artifact 和 Loader 验证待 V2-WP5～WP7

日期：2026-08-18

上位方案：[V2 详细实现方案](./DawnlightCoreWebsiteV2ImplementationPlan.md)

前置记录：[V2-WP3 实现记录](./V2-WP3-Implementation.md)

## 1. 工作包边界

WP4 把现有 `/shaders/` 静态候选页升级为可由 API/fixture 共同消费的只读目录。它定义 Project、ProjectVersion、Artifact、Compatibility、Image 和 License 的公共 DTO，并让玩家可以按环境筛选项目、查看版本和理解推荐/排除原因。

本批明确不实现：

- 前端写数据库、作者投稿或账号权限；
- 上传、quarantine、解压预检、Loader 验证和审核发布；
- 没有服务端对象存储证据时生成下载 URL；
- 从项目名或文件名猜测许可证、GPU 兼容性或 artifact hash；
- 将 `metadata-only`、`schema-only`、`unverified` candidate 显示为可发布版本。

## 2. 数据模型

共享模型位于 `packages/contract-data/src/directory.ts`，Preview fixture 位于 `contracts/dawnlight/preview/directory-fixture.json`。

| 模型 | 关键字段 | 当前 Preview 状态 |
| --- | --- | --- |
| Project | `id`、`slug`、`name`、`visibility`、`licenseId`、`sourceRef` | 1 个 public candidate |
| ProjectVersion | `version`、`channel`、`status`、`verification`、`contractVersion`、`coreCommit` | Dawnlight v3.1 / metadata-only |
| Artifact | 平台、架构、GPU、文件名、大小、SHA-256、下载 URL、状态 | 空数组；没有真实 artifact |
| Compatibility | Core range、Game API、平台、架构、GPU 类别、状态、原因 | `unverified`，无设备证据 |
| Image | URL、alt、状态、不可用原因 | 空数组；不生成占位截图 |
| License | SPDX、名称、URL、状态、原因 | `unknown`，不推断许可证 |

Artifact DTO 没有 quarantine 对象键、内部 bucket key 或上传 session 字段。即使未来数据库中存在这些字段，公共 API 也只能投影已发布或明确允许公开的字段。

## 3. Fixture 与数据服务

`directory-fixture.json` 使用独立数组保存实体关系，并由 `0003_directory.sql` 映射到 PostgreSQL：

```text
projects
projectVersions -> projectId
artifacts -> projectVersionId
compatibilities -> projectVersionId
images -> projectVersionId
licenses -> projectId
```

`createDirectoryDataService()` 提供：

```text
listProjects(query)
getProject(slug)
getVersion(slug, version)
```

列表查询支持：

```text
q, core, gameApi, platform, architecture,
gpu, channel, license, status
```

服务层会生成 `recommendation`：

- `artifact`：只选择 `status=available` 的 artifact；
- `reasons`：解释为什么候选进入结果；
- `exclusions`：解释没有下载、未验证或被过滤的原因。

当前 candidate 没有可用 artifact，因此推荐结果为 `artifact: null`，并返回 metadata-only 排除原因。平台、架构和 GPU 的非空筛选不会把“没有兼容性记录”解释成兼容，而是返回空结果。

## 4. API 路由与缓存

新增只读接口：

```text
GET /api/v1/directory/projects
GET /api/v1/directory/projects/{slug}
GET /api/v1/directory/projects/{slug}/versions/{version}
```

列表请求示例：

```text
/api/v1/directory/projects?q=Dawnlight&gameApi=API_1.9.2.1&status=preview
```

接口使用与 WP2 contract API 相同的公共缓存策略和强 ETag：

```text
Cache-Control: public, max-age=60, s-maxage=86400, stale-while-revalidate=604800
ETag: "<sha256 response payload>"
```

项目或版本不存在时返回 `404` 和解释性错误，不回退到相似 slug 或最近版本。OpenAPI DTO 已同步生成到 `packages/api-client/src/generated.ts`。

当前 API 的 directory service 仍从受控 Preview fixture 构造；`0003_directory.sql` 和 seed 命令已经准备好数据库写入，但数据库读取投影将在 staging smoke 后接入，避免在未验证的混合数据源之间产生不一致。

## 5. 前端目录与筛选

`apps/web/src/components/directory/directory-explorer.tsx` 实现：

- 搜索项目名、稳定 ID、版本和 Core commit；
- Core commit 前缀筛选；
- Game API、平台、架构、GPU 类别、频道、许可证状态和项目状态筛选；
- 所有筛选写入 URL，可分享和恢复；
- API 优先，未配置 API 或请求失败时使用构建期 fixture；
- 显示数据来源状态、项目 ID 复制按钮、兼容性原因和推荐/排除原因；
- 没有 artifact 时显示“暂无可下载 artifact”，不渲染下载锚点。

现有目录详情页新增：

- 项目版本列表；
- 每个版本的 channel、status、verification、Core commit 和 artifact 数量；
- 兼容性记录和原因；
- 许可证核对状态；
- 图片缺失状态；
- 明确的当前不可下载说明。

## 6. 维护者 seed/import 边界

WP4 提供维护者侧 `pnpm db:directory:seed`（底层为 `@dawnlight/database directory:seed`）。它只从受控 fixture 事务性 upsert，不开放浏览器写 API。后续 seed/import 必须遵循：

1. 输入只能来自维护者命令或审核后的机器文件，不能来自浏览器直写；
2. 导入前校验 Project/Version/Artifact 外键关系、状态转换和许可证字段；
3. artifact 必须先有服务端 hash、size、对象存储 HEAD 证据，再允许进入 `available`；
4. `quarantine`、`withdrawn`、`unverified` 记录可以保留在内部数据库，但默认列表和下载推荐不得暴露私有字段；
5. 导入要有幂等键和审计记录，失败不得覆盖当前 public snapshot；
6. 未来发布时再由 WP7 生成签名 feed，而不是在 WP4 直接拼接下载链接。

## 7. SEO 与公开页面

目录列表和项目详情继续使用静态可导出页面，项目详情通过 `generateStaticParams` 从当前公开 fixture 生成。详情 metadata 使用 project summary，不引用内部对象路径。

当项目进入真实 published 状态后，WP4 后续应增加：

- 版本详情的 canonical URL；
- `SoftwareApplication` 或项目类型 JSON-LD（字段必须来自已发布 DTO）；
- 仅把 published project/version 加入 sitemap；
- withdrawn/unverified 页面保留历史说明，但不设置默认下载推荐；
- 图片 URL 经过公开 CDN allowlist 和大小限制后才进入 metadata。

当前 Preview sitemap 仍因站点 preview mode 返回空数组，符合 V1/WP0 生产门禁。

## 8. 验证记录

已通过：

- `pnpm typecheck`；
- `pnpm test`：Web 7、Contract data 5、API 4 tests passed；
- OpenAPI 重新生成 API client；
- API directory list/detail smoke（含 ETag）；
- API 输出不包含 `objectKey` 等私有 artifact 字段；
- directory fixture 与 schema 关系校验；
- Playwright 已覆盖目录筛选、无 artifact 和详情资产状态回归；
- 静态构建和完整 `pnpm check` 需在 WP4 改动稳定后再次执行；WP5 已增加作者页后会再次覆盖。

## 9. 退出条件

- [x] Project、ProjectVersion、Artifact、Compatibility、Image、License 公共模型；
- [x] 只读 fixture 和 TypeScript data service；
- [x] 项目列表、项目详情、版本详情；
- [x] URL 编码的查询、筛选和兼容性空结果；
- [x] 推荐原因、排除原因和无 artifact 安全边界；
- [x] API 路由、OpenAPI DTO、ETag 和缓存策略；
- [x] 前端 API/fallback、复制 ID、响应式目录卡片和版本信息；
- [x] 维护者 seed/import 命令与 PostgreSQL 目录表定义；
- [ ] 真实 artifact、服务端 hash/HEAD 证据和签名；
- [ ] Loader/设备兼容性验证；
- [ ] published project 的 SEO JSON-LD、sitemap 和 CDN 图片审核。

## 10. 下一工作包

V2-WP5 已完成第一版 OIDC、项目团队和作者草稿。下一步 V2-WP6 进入 quarantine upload；写操作仍必须保留 WP4 的 public DTO 投影，不能直接暴露数据库行或 quarantine 字段。
