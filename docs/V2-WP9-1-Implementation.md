# V2-WP9-1：部署制品实现记录

状态：工程实现完成；arch-vm WP9-A 演练通过后方可作为本工作包的运行证据，尚未满足 WP9-B 真实 Beta 门禁

## 1. 目标和边界

WP9-1 把已经通过单元与集成测试的 Web、API 和 Worker 变成可部署制品，并为 arch-vm 提供一套可重复创建、可冒烟、可销毁的 WP9-A Compose 拓扑。

本工作包交付的是工程制品，不等于公开上线：

- WP9-A 使用本地镜像标签、mock OIDC、测试密钥和隔离 bucket；
- WP9-B 仍要求真实 staging 数据库、bucket、OIDC client、CDN/TLS、Registry digest 和实名责任清单；
- Validator 默认禁用。在 `ghcr.io/eltancex/dawnlight-validator@sha256:...` 的受信制品、SBOM、provenance、漏洞报告和 attestation 就绪前，不得把 Loader 验证标记为已上线；
- 单 API 实例只验证 Beta 功能，不提供高可用承诺。

## 2. 交付物

| 制品 | 文件 | 责任 |
| --- | --- | --- |
| Web 镜像 | `infra/images/Dockerfile.web` | 构建静态站，使用非 root Caddy 提供只读文件服务 |
| API/Worker 镜像 | `infra/images/Dockerfile.services` | 从同一源码和锁文件构建两个非 root 运行时目标；Worker 带固定版本 Docker CLI |
| WP9-A 编排 | `infra/compose/wp9-a.compose.yml` | Caddy edge、Web、单 API、单 Worker、PostgreSQL、MinIO、mock OIDC、迁移和初始化任务 |
| 环境生成器 | `scripts/create-wp9-a-env.mjs` | 生成随机测试密钥、Ed25519 签名密钥、构建修订和时间元数据 |
| 静态门禁 | `scripts/validate-wp9-deployment.mjs` | 检查 digest 固定、权限、端口、网络、镜像目标和默认禁用 Validator |
| 运行冒烟 | `scripts/smoke-wp9-a.mjs` | 验证站点、文档、API health、Contract、搜索和 OIDC discovery |
| 镜像清单 | `scripts/capture-wp9-image-manifest.mjs` | 记录本地镜像 ID、平台、大小、OCI 标签和非 root 用户 |

## 3. 可复现性与供应链约束

所有 Dockerfile 基础镜像和 Compose 第三方镜像均使用 manifest digest 固定。构建使用：

- `pnpm install --frozen-lockfile`；
- 固定的 `pnpm@11.19.0`；
- clean commit 派生的 `IMAGE_REVISION`、`IMAGE_CREATED` 和 `SOURCE_DATE_EPOCH`；
- `org.opencontainers.image.*` 标签记录 source、revision、created 和 version；
- `.dockerignore` 排除本地产物、报告、环境文件和 secret；
- 将 workspace 内部包物化进运行时镜像，避免 pnpm 构建目录链接泄漏为悬空链接。

`--allow-dirty` 只用于 WP9-A 调试。由 dirty tree 构建的镜像可以证明拓扑可运行，但不能成为候选 Beta 制品。

## 4. WP9-A 拓扑

```text
browser
  ├─ :58080 -> Caddy edge -> /api、/health -> one API
  │                         -> other paths -> static Web
  └─ :58082 -> mock OIDC

private network
  ├─ API -> PostgreSQL + MinIO + OIDC
  ├─ Worker -> PostgreSQL + MinIO + Docker socket
  └─ one-shot: bucket init + database migrate/ingest/seed
```

只有 edge 和 mock OIDC 绑定宿主机端口。数据库、对象存储、API、Worker 和 Web origin 仅在 Compose 网络内可达；private 网络标记为 `internal`。

Web、API、Worker 和 edge 均使用只读根文件系统、`no-new-privileges` 和最小临时目录。Caddy 在删除全部 capabilities 后只补回 `NET_BIND_SERVICE`；API 和 Worker 不补回 capability。

### 4.1 Worker 隔离的已知边界

WP9-A Worker 通过 Docker socket 启动一次性 Validator 容器。Docker socket 对宿主机具有高权限，因此这一做法只允许在隔离 arch-vm 使用。进入 WP9-B 前必须改用独立 rootless runner、受限 socket proxy 或等价的专用验证主机，并重新完成超时、目录挂载、网络隔离和清理演练。

## 5. arch-vm 操作步骤

先准备只有运行账号和 Docker 组可写的绝对工作目录：

```bash
export WP9_WORKSPACE=/home/eltancex/dawnlight-wp9-a-workspaces
mkdir -p "$WP9_WORKSPACE"
chgrp docker "$WP9_WORKSPACE"
chmod 0770 "$WP9_WORKSPACE"
```

在仓库根目录生成不入库的环境文件：

```bash
node scripts/create-wp9-a-env.mjs \
  --public-origin http://192.168.137.202:58080 \
  --oidc-origin http://192.168.137.202:58082 \
  --workspace-root "$WP9_WORKSPACE" \
  --docker-gid "$(stat -c '%g' /var/run/docker.sock)"
```

校验、构建并启动：

```bash
pnpm wp9:check
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml config --quiet
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml build
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml up -d --wait
```

冒烟并采集可审计清单：

```bash
set -a
. infra/compose/wp9-a.env
set +a
node scripts/smoke-wp9-a.mjs
node scripts/capture-wp9-image-manifest.mjs
```

清单默认写入 `reports/wp9-a-image-manifest.json`，其中的本地 image ID 不是 Registry manifest digest，不能填入 WP9-B 部署声明。

停止工程环境：

```bash
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml down
```

仅在确认不再需要测试数据时附加 `-v` 删除本项目的命名卷。

### 5.1 可选公网 TLS Edge

需要在一次性测试主机上验证域名、TLS 和 80→443 跳转时，使用独立覆盖文件，避免把证书或私钥放入仓库、镜像和 Compose 环境值。证书与私钥必须预先拆分到 Docker host 的受控目录，并让非 root Caddy 用户只读：

```bash
install -d -m 0750 -o root -g 65532 /srv/dawnlight-test/secrets
chown root:65532 /srv/dawnlight-test/secrets/core.example.test.crt \
  /srv/dawnlight-test/secrets/core.example.test.key
chmod 0440 /srv/dawnlight-test/secrets/core.example.test.crt \
  /srv/dawnlight-test/secrets/core.example.test.key
```

生成 HTTPS 环境文件时显式提供宿主机绝对路径：

```bash
node scripts/create-wp9-a-env.mjs \
  --public-origin https://core.example.test \
  --oidc-origin http://192.0.2.10:58082 \
  --docker-gid "$(stat -c '%g' /var/run/docker.sock)" \
  --tls-cert-file /srv/dawnlight-test/secrets/core.example.test.crt \
  --tls-key-file /srv/dawnlight-test/secrets/core.example.test.key
```

HTTPS 模式会把原始 `:58080` Edge 限制到 `127.0.0.1`。公网 TLS Edge 以固定 digest 的非 root Caddy 监听 80/443，80 永久重定向到 HTTPS，443 直接按与原 Edge 相同的顺序分发文档搜索、API、artifact gateway 和静态页面：

```bash
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml \
  -f infra/compose/wp9-a-tls.compose.yml config --quiet
docker compose --env-file infra/compose/wp9-a.env \
  -f infra/compose/wp9-a.compose.yml \
  -f infra/compose/wp9-a-tls.compose.yml up -d --wait tls-edge
```

Cloudflare Origin Certificate 只应用于 Cloudflare 到源站的连接；公开浏览器验证必须通过已启用代理的域名进行。此覆盖层仍可搭配 mock OIDC 和 disposable 数据，因此只能作为 WP9-A 公网测试证据，不替代 WP9-B 的独立 provider、secret manager、真实 OIDC、CDN purge/deny 和供应链门禁。

## 6. 运营入口

数据库迁移、Contract ingest 和只读目录 seed 由 `migrate` 一次性任务完成，任务成功后 API 和 Worker 才启动。`bootstrap-admin` 放在 `operator` profile 中，不会随普通 `up` 自动执行；临时 token 只能由当班 Infrastructure Operator 在受控终端生成和立即消费。

Validator 只有同时满足以下条件才可启用：

1. `LOADER_VALIDATOR_ENABLED=true`；
2. `LOADER_VALIDATOR_IMAGE` 是 `repository@sha256:<64 hex>`；
3. Core commit、OCI revision、SBOM、provenance、漏洞结论和 OIDC attestation 一致；
4. Validator workspace 的绝对路径和 Docker GID 已通过预检。

## 7. 退出条件与剩余门禁

WP9-1 的工程退出条件：

- Web、API、Worker Docker 目标可从锁定依赖构建；
- Compose config 和静态安全门禁通过；
- 一次性迁移、bucket 初始化、API readiness、Worker 进程、edge 和 OIDC 正常；
- Web/API/OIDC 冒烟通过；
- 镜像清单证明 OCI revision 和非 root 用户符合环境文件。

不属于 WP9-1、仍会阻断 WP9-B 的内容：

- 发布 Web/API/Worker 和 Validator 的真实 Registry manifest digest；
- Validator 的 SBOM、provenance、漏洞报告与 GitHub OIDC attestation；
- 独立真实 staging provider、TLS/CDN 与 secret manager；
- Docker socket 隔离升级；
- 六类运营角色的 primary/backup 实名映射；
- takedown 数据模型、API、对象阻断/CDN purge 和 P0 演练。

下一步进入 WP9-2，按 `0008+` migration 实现并演练 takedown；Registry 发布和真实 staging 资源可并行准备，但未通过 WP9-B 前不得邀请真实作者。

## 8. 2026-08-19 arch-vm 工程证据

在 `192.168.137.202` 的隔离 WP9-A 项目中已验证：

- Docker Hub/GHCR 固定 digest 基础镜像可拉取，Web、API、Worker 三个 target 构建成功；
- PostgreSQL、MinIO、mock OIDC、Web、API、Worker 和 edge 全部进入 healthy，迁移、bucket 初始化和 Validator workspace 初始化均以 `0` 退出；
- `scripts/smoke-wp9-a.mjs` 的 Web、文档、作者入口、live/ready、Contract、搜索、OIDC alive/discovery 全部通过；
- Worker 内的固定 Docker CLI 可连接测试 VM socket，版本探测成功；
- `scripts/capture-wp9-image-manifest.mjs` 成功记录三个本地镜像，且 OCI revision 与环境声明一致、运行用户均为非 root。

本次为 WP9-1 开发过程中的 disposable dirty-tree rehearsal，revision 标签仍指向其干净基线 `fafc789`。它证明部署定义能完整运行，但不作为候选 Beta 镜像的供应链证据；合并 WP9-1 后必须从新的精确 clean commit 重新构建、签名和发布。
