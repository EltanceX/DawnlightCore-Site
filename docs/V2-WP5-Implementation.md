# V2-WP5：OIDC、项目团队与作者草稿

状态：WP5 第一版代码完成；OIDC provider、数据库 staging 演练和真实运营 SOP 待部署环境验证

## 1. 目标与边界

WP5 将 V2 从公开只读目录推进到邀请制作者工作区，但只允许维护私有元数据草稿。它不实现上传、quarantine、真实 Loader 验证、审核发布或公开下载。

本批完成的最小作者旅程是：

```text
平台管理员创建账户邀请
  -> 作者使用 OIDC Authorization Code + PKCE 登录
  -> 接受邀请并创建 auth session
  -> 创建 Project draft
  -> 创建 ProjectVersion draft 与 compatibility/artifact 预声明
  -> owner 邀请 maintainer/reviewer
  -> 读取项目审计摘要
```

任何 `artifactDeclarations` 都只是预声明；它们没有对象存储 key、hash、签名、下载 URL，也不能进入 WP4 public directory。

## 2. 认证实现

### 2.1 OIDC 协议

`apps/api/src/oidc.ts` 使用 `openid-client` 的 discovery 和 Authorization Code API：

- 每次登录生成新的 `state`、`nonce`、PKCE `code_verifier` 和 `code_challenge`；
- `state`、`code_verifier`、`nonce`、安全 return path 保存到 `oidc_login_transactions`；
- 浏览器只持有签名的短期 HttpOnly transaction cookie；
- callback 同时验证 cookie state、数据库事务未过期/未消费、OIDC state、nonce 和 PKCE；
- ID Token 必须有稳定 `sub`、`email` 和 `email_verified=true`；
- 账户首次创建必须匹配一次性 `account_invitations`；没有邀请不会自动创建用户。

生产/staging 必须使用 HTTPS。Cookie 使用 `__Host-dawnlight_session`，HttpOnly、Secure、SameSite=Lax、Path=/；开发/测试环境使用不带 `__Host-` 前缀的本地 cookie。

### 2.2 Session 与 CSRF

- Session cookie 只保存签名的不透明随机 token；数据库只保存 SHA-256 token hash；
- Session 有明确过期时间，可撤销；禁用用户的全部 session 会被撤销；
- `/api/v1/auth/session` 返回私有的 per-session CSRF token；CSRF token 不是认证凭据；
- 所有浏览器写请求必须同时提供：Session cookie、`X-CSRF-Token`、精确 `Origin`、`Idempotency-Key`；
- 私有响应使用 `Cache-Control: private, no-store`，不进入 CDN。

## 3. 数据库模型

迁移：[0004_authoring.sql](../packages/database/migrations/0004_authoring.sql)

| 表 | 用途 |
| --- | --- |
| `auth_users` | OIDC 账户状态、平台管理员标记 |
| `auth_oidc_identities` | `(issuer, subject)` 唯一绑定 |
| `auth_sessions` | opaque session hash、CSRF token、过期/撤销 |
| `oidc_login_transactions` | state、PKCE、nonce、return path 的一次性事务 |
| `account_invitations` | 邀请制首次登录；bootstrap 邀请可授予 platform-admin |
| `author_projects` | 私有 Project draft |
| `project_memberships` | owner/maintainer/reviewer 资源角色 |
| `project_invitations` | 项目成员一次性邀请 |
| `author_project_versions` | 私有版本草稿、changelog、兼容性和 artifact 预声明 |
| `idempotency_keys` | 24 小时幂等响应缓存和请求 hash 冲突检测 |
| `audit_events` | append-only 允许/拒绝/失败事件；触发器拒绝更新/删除 |
| `account_operation_requests` | recovery、deletion、copyright-complaint 运营请求占位 |

版本草稿使用 `revision` 乐观并发控制；更新时必须带 `expectedRevision`，冲突返回 `409 DraftRevisionConflict`。

## 4. API

实现：[apps/api/src/authoring.ts](../apps/api/src/authoring.ts)

### 认证

```text
GET  /api/v1/auth/oidc/start?returnTo=/zh-CN/author/       # existing account
POST /api/v1/auth/oidc/start                             # preferred when invite is required
GET  /api/v1/auth/oidc/callback
GET  /api/v1/auth/session
POST /api/v1/auth/logout
POST /api/v1/auth/invitations                 # platform-admin
POST /api/v1/auth/users/:userId/disable       # platform-admin
```

### 作者与团队

```text
GET    /api/v1/author/projects
POST   /api/v1/author/projects
PATCH  /api/v1/author/projects/:projectId
POST   /api/v1/author/projects/:projectId/versions
PATCH  /api/v1/author/projects/:projectId/versions/:versionId
POST   /api/v1/author/projects/:projectId/invitations
DELETE /api/v1/author/projects/:projectId/invitations/:invitationId
POST   /api/v1/author/invitations/accept
GET    /api/v1/author/projects/:projectId/audit
```

公共 DTO 与 OpenAPI：[contracts/openapi/v1.yaml](../contracts/openapi/v1.yaml)。数据库行、session token hash、OIDC refresh token、私有对象键和验证日志不会出现在这些响应中。

## 5. 权限矩阵

| 操作 | owner | maintainer | reviewer | 未登录 |
| --- | --- | --- | --- | --- |
| 查看自己所属项目/版本 | ✓ | ✓ | ✓ | 401 |
| 创建/编辑项目草稿 | ✓ | ✓ | — | 401/403 |
| 创建/编辑版本草稿 | ✓ | ✓ | — | 401/403 |
| 邀请团队成员 | ✓ | — | — | 401/403 |
| 撤销团队邀请 | ✓ | — | — | 401/403 |
| 接受自己的邀请 | ✓ | ✓ | ✓ | 401 |
| 查看项目审计摘要 | ✓ | ✓ | ✓ | 401/403 |
| 创建账户邀请/禁用账户 | platform-admin | — | — | 401/403 |

授权失败也会写 `audit_events(outcome='denied')`；前端隐藏按钮不作为安全边界。

## 6. 前端作者工作区

页面：[apps/web/src/app/[locale]/author/page.tsx](../apps/web/src/app/[locale]/author/page.tsx)

因为 Web 仍采用 Next.js static export，作者页面是安全的静态壳：

- 没有 `NEXT_PUBLIC_API_ORIGIN` 时显示“未连接作者 API”，不使用 fixture 模拟私人数据；
- 配置 API 后浏览器使用 `credentials: include` 调用 Session/Author API；
- 已登录用户可创建项目、版本草稿、兼容性声明、artifact 预声明；
- owner 可邀请 maintainer/reviewer 并复制一次性 token；
- platform-admin 可创建首次账户邀请；
- reviewer 只能读取，不能提交写请求；
- 页面显示“未上传、未验证”，不会生成下载链接。

作者页设置了 `robots: noindex`，避免私有工作区被搜索索引。

## 7. 本地测试 OIDC provider

Compose 增加 `oidc` 服务，使用 pinned 的 `ghcr.io/navikt/mock-oauth2-server:4.0.0`，仅用于测试，不得用于生产。

```powershell
docker compose -f infra/compose/v2-dev.compose.yml up -d --wait
pnpm db:migrate
$env:WP5_BOOTSTRAP_ADMIN_EMAIL = "author@example.test"
pnpm db:authoring:seed
```

随后以以下环境启动 API：

```text
OIDC_ENABLED=true
OIDC_ISSUER_URL=http://127.0.0.1:59002/dawnlight
OIDC_CLIENT_ID=dawnlight-web
OIDC_CLIENT_SECRET=local-test-only
OIDC_REDIRECT_URI=http://127.0.0.1:4100/api/v1/auth/oidc/callback
```

`pnpm db:authoring:seed` 只打印一次 bootstrap token；作者页通过 form POST 传递 invite token，避免它进入 URL。不要把 token 写入 `.env`、日志、commit 或截图。真实 staging 必须使用独立 OIDC client、数据库和 cookie secret。

## 8. 运营 SOP 占位

本批通过 `account_operation_requests` 预留以下流程入口，正式上线前必须由责任人补齐：

1. 账户恢复：先核验 OIDC provider 账户归属，再撤销旧 session、重新邀请或合并 identity；
2. 账户删除：记录请求、保留审计和已发布版本的必要历史，按保留期清理私有草稿；
3. 版权投诉：冻结受影响项目的公开入口，保留 artifact hash/审核证据，记录处理决定；
4. 团队成员变更：撤销邀请或删除 membership 后验证旧 session 和旧 token 不能继续写入；
5. 管理员变更：至少保留两名可审计 platform-admin，bootstrap token 使用后立即失效。

## 9. 验证与未完成项

已验证：

- API 注入式 OIDC 流程覆盖 state cookie、callback、session、CSRF/Origin 拒绝和作者创建草稿；
- OpenAPI 与 API Client 已生成；
- 数据库迁移、幂等、角色、乐观 revision 和 append-only audit 表已加入；
- 静态作者页、无 API 状态、移动端布局和无障碍路径加入回归测试。

尚待 staging/后续 WP：

- 连接真实测试 provider 完成浏览器端登录、邀请接受和成员撤销演练；
- 用 PostgreSQL staging 运行迁移/seed，并核验失败事务不会留下半成品；
- WP6 接入预签名 quarantine upload；
- WP7 接入真实 Loader、审核队列和 published copy；
- 正式冻结账号合并、恢复、删除和版权投诉责任人及保留期。
