# V2-WP3：Developer Tools 前端

状态：Preview 前端实现完成；真实 Graph 画布与 Variant explain 列表等待上游 contract

日期：2026-08-18

上位方案：[V2 详细实现方案](./DawnlightCoreWebsiteV2ImplementationPlan.md)

前置记录：[V2-WP2 实现记录](./V2-WP2-Implementation.md)

## 1. 工作包目标与边界

WP3 将 WP2 的版本化只读 contract data service 接入面向光影作者的交互页面，目标是让作者通过稳定 ID、诊断码、Catalog 类型和 sourceRef 完成常见查询，而不必依赖 DawnlightCore 的私有 C# 类型。

本工作包实现：

- 工具搜索、筛选、版本选择和可分享 URL；
- API 优先、同源构建期 fixture 回退；
- Diagnostics、Catalog、Capability、Pipeline、Variant 和 Contract Diff 页面；
- 稳定 ID、诊断码和 JSON Pointer 复制；
- 文档上下文链接、空状态、错误边界和数据来源状态；
- 响应式、键盘焦点、深浅主题和静态输出回归。

本工作包不实现：

- 浏览器内执行 Loader、shader 编译或设备探测；
- 从 Schema 或 C# 私有实现推断 Pipeline Graph；
- 从 Manifest 自行枚举最终 define/variant；
- 创建或修改 contract、项目、版本、artifact；
- 将 Preview contract 升级为稳定 ABI。

## 2. 路由与用户能力

| 路由 | 当前能力 | URL 状态 | 数据边界 |
| --- | --- | --- | --- |
| `/zh-CN/tools/diagnostics/` | 诊断码搜索、分类筛选、详情深链 | `version`、`q`、`group` | 当前 4 条 Preview 诊断 |
| `/zh-CN/tools/catalog/` | Catalog ID 搜索、类型筛选 | `version`、`q`、`kind` | 当前 62 个受信 Catalog ID |
| `/zh-CN/tools/capabilities/` | Capability 搜索、状态筛选 | `version`、`q`、`status` | 当前 2 个能力 ID，不含设备上限 |
| `/zh-CN/tools/pipeline/` | Graph 查询边界、节点/边计数、列表降级入口 | `version`、`q` | 当前 Graph 为 `unavailable` |
| `/zh-CN/tools/variants/` | Variant explain 查询边界 | `version`、`q` | 当前 Variant 为 `unavailable` |
| `/zh-CN/tools/contract-diff/` | snapshot 版本比较 | `from`、`to` | 当前只有一个版本，同版本 diff 为空 |

URL 参数只在值不同于页面默认值时保留。搜索或筛选变化使用 `history.replaceState`，因此可复制当前地址分享，并避免每次输入都创建浏览器历史记录。`popstate` 会重新读取参数，浏览器前进/后退保持可用。

未知版本不会被自动替换成最近版本。页面显示明确错误状态，防止共享链接在未来悄悄改变含义。

## 3. 数据读取策略

### 3.1 API 优先

浏览器配置 `NEXT_PUBLIC_API_ORIGIN` 后，工具按 WP2 OpenAPI 路径读取：

```text
GET /api/v1/contracts/{version}/diagnostics
GET /api/v1/contracts/{version}/catalog
GET /api/v1/contracts/{version}/capabilities
GET /api/v1/contracts/{version}/graph
GET /api/v1/contracts/{version}/variant
GET /api/v1/contracts/diff?from=&to=
```

API 返回成功时页面显示“实时只读 API”。请求期间先保留 fixture 内容并显示“正在连接 API”，避免界面闪为空白。

### 3.2 静态 fixture 回退

以下情况使用 `contracts/dawnlight/preview/ingest-fixture.json`：

- 静态 Preview 构建未配置 `NEXT_PUBLIC_API_ORIGIN`；
- API 网络请求失败；
- API 返回非 2xx 状态。

状态标签会分别显示“构建期 fixture”或“API 不可用 · fixture”，不会把 fallback 冒充实时结果。API 与 fixture 都源自 WP2 的同一规范化 contract；前端不维护第二份手写 Catalog 或 diagnostics 数据。

### 3.3 版本选择

当前版本列表来自构建期 ingest fixture，只有 `preview-2026-08-16`。未来增加 snapshot 后应先扩展一个已签名或明确 Preview 状态的版本索引，再允许选择；不能仅根据 API 中任意字符串创建版本选项。

## 4. 共享前端组件

`apps/web/src/components/developer-tools/` 包含：

- `tool-shared.tsx`：URL 状态、API/fallback、筛选栏、来源状态、复制按钮、空状态；
- `diagnostic-explorer.tsx`：诊断搜索、分类和详情深链；
- `catalog-explorer.tsx`：Catalog 类型分组和受信 ID 查询；
- `capability-explorer.tsx`：Capability 状态和 sourceRef；
- `graph-explorer.tsx`：Graph availability、计数和列表降级；
- `variant-explorer.tsx`：Variant explain availability 和原始记录降级；
- `contract-diff-explorer.tsx`：from/to 版本选择及新增、移除、变更分组。

所有实体卡片显示 contract 中的 `sourceRef.path` 和 JSON Pointer。作者可以复制：

- Catalog/Capability/Graph/Variant 的稳定 ID；
- Diagnostic 的诊断码；
- 实体对应的 JSON Pointer。

当前 fixture 的 `deprecation` 全部为 `null`，因此页面不虚构迁移建议。未来出现 deprecation 记录后，应直接展示并复制 contract 提供的 replacement/migration 字段，而不是由 UI 根据名称推断。

## 5. Graph 与 Variant 的诚实降级

当前 Graph 记录为 `status=unavailable`，节点和边均为空；Variant 记录同样为 `unavailable`，没有 explain 记录。因此：

- Pipeline 页面显示节点 `0`、边 `0`、缺失原因和真实 sourceRef；
- Variant 页面显示缺失 CLI JSON contract 的原因和真实 sourceRef；
- 页面不会创建示例节点、猜测边或枚举 define；
- 不会把空画布、空 explain 列表解释为 Loader 验证通过。

V2 原方案要求 Graph 使用 React Flow + ELK.js。根据 V2-D01 的冻结边界，本批没有安装或加载这两个运行时，因为没有真实节点和边可绘制。满足以下条件后再启用：

1. Core CI 输出包含稳定 node ID、edge、资源生命周期和 sourceRef 的 graph dump；
2. graph dump 绑定 Core commit、Manifest 版本、内容 hash 和 contract 版本；
3. WP2 ingest 和 OpenAPI 验证真实非空 Graph；
4. 图形模式同时保留键盘可访问的节点/边列表；
5. E2E 验证节点数量一致，非空数据不会生成空画布。

Variant explain 也必须等待 CLI 输出 option、define、排除原因、最终选择、输入 hash、CLI 版本和 Core commit 后才能成为真实查询结果。

## 6. 可访问性、响应式与主题

本批实现遵循现有设计 token，并补充：

- 所有输入都有可访问名称，筛选使用原生 `input` 和 `select`；
- 复制、详情和重置操作均可键盘聚焦；
- 结果数量与数据来源使用 live/status 语义；
- 桌面筛选栏为多列，中等宽度为两列，窄屏为单列；
- 记录 ID、sourceRef 和 diff ID 可换行，避免 200% zoom 横向溢出；
- 深浅主题只使用站点 token；
- loading 动画遵守 `prefers-reduced-motion`；
- Graph 即使未来启用画布，也必须保留列表降级。

## 7. 静态输出与回归门禁

静态输出校验新增以下必需路由：

```text
zh-CN/tools/pipeline/index.html
zh-CN/tools/variants/index.html
zh-CN/tools/contract-diff/index.html
```

由于 Catalog Explorer 需要把当前 62 个带 sourceRef 的 ID 在静态构建中序列化为 fixture，`htmlDocumentBytes` 门禁从 128 KiB 调整为 160 KiB。单页预算仍然是硬失败，整体输出、JavaScript、CSS、搜索索引和图片预算不变；后续应优先通过分页或按需加载降低 Catalog HTML，而不是继续无条件放大预算。

构建检查同时确认：

- 工具首页包含 Contract Diff 和只读 API/fallback 说明；
- Pipeline 输出保留 `Graph unavailable`；
- Variant 输出保留 `Variant explain unavailable`；
- 同版本 Contract Diff 输出明确空状态。

Playwright 覆盖：

- 诊断 `q`/`group` 深链恢复和结果过滤；
- Catalog `q`/`kind` 深链恢复；
- 诊断码与 JSON Pointer 复制入口；
- Graph/Variant 的真实不可用边界；
- Contract Diff 的单版本空状态；
- 新工具路由的 axe serious/critical 回归。

## 8. 环境配置与本地验证

纯静态 fixture 模式无需新增环境变量。连接本地或远端只读 API 时配置：

```env
NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:3001
```

该值会进入浏览器 bundle，必须是公开可访问的 API origin，不能包含密码、token 或内部连接串。API 还需按部署域名配置允许的 CORS origin。

建议验证顺序：

```powershell
pnpm typecheck
pnpm v2:check
pnpm test
pnpm build
pnpm verify:static
pnpm test:e2e
pnpm check
```

## 9. 退出条件

- [x] 工具路由、版本选择、搜索、筛选、URL 深链和空/错误状态；
- [x] Diagnostic、Catalog、Capability 交互查询；
- [x] Graph、Variant availability 和可访问列表降级路径；
- [x] Contract Diff 页面及同版本空状态；
- [x] API 优先和构建期 fixture fallback；
- [x] 稳定 ID、诊断码、JSON Pointer 复制；
- [x] 文档上下文链接；
- [x] 响应式、键盘、主题、reduced-motion 和自动化 axe 回归；
- [ ] 真实非空 Graph 的 React Flow + ELK.js 画布；
- [ ] 真实 CLI Variant explain、迁移建议和 Loader 结果。

WP3 的 Preview 前端已达到当前数据合同允许的退出边界。最后两项是上游数据不可用导致的显式门禁，不应通过假数据关闭。

## 10. 下一工作包

V2-WP4 进入只读目录与兼容性推荐：建立 Project、ProjectVersion、Artifact、Compatibility、Image 和 License 数据模型，提供维护者 seed/import，并把玩家筛选条件、推荐原因和排除原因编码到可分享 URL。目录仍不得暴露 quarantine、私有对象键或未经验证的下载。
