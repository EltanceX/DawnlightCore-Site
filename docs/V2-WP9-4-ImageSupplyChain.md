# V2-WP9-4：网站部署镜像供应链

状态：工程实现和首次候选发布完成；WP9-A digest 部署与演练已通过，WP9-B/Production 仍未批准

## 1. 目标与边界

本阶段把 Web、API 和 Worker 从“可在 WP9-A 本地构建”推进为“由质量门禁后的 clean GitHub commit 构建并发布”。它不构建 DawnlightCore Loader Validator，也不自动批准任何 digest 进入 WP9-B 或 Production。

固定边界如下：

- `Quality` 的 `verify` job 是镜像发布的直接前置条件；验证失败时不得调用发布 workflow；
- 只有 `push` 事件可以发布镜像；PR、定时检查和普通手动质量检查没有 GHCR 写入路径；
- GHCR 写入位于 `beta-images` environment，job 只申请 `contents: read`、`packages: write`、`id-token: write`、`attestations: write` 和 `artifact-metadata: write`；
- 镜像只有 `sha-<40-character-commit>` tag，不发布 `latest`；部署值必须使用 `repository@sha256:...`；
- 当前 Web 制品固定为 Preview 模式，默认 Site/API origin 均为 `https://core.eltancex.top`。可通过仓库变量 `WP9_SITE_ORIGIN`、`WP9_API_ORIGIN` 覆盖，但一次构建的 origin 会固化进静态站；
- Validator 仍必须由独立 Core CI 从精确 Core commit 构建，不能由本 workflow 或开发机二进制替代。

## 2. 工作流

`.github/workflows/quality.yml` 在 `verify` 成功后调用 `.github/workflows/publish-images.yml`。可复用 workflow 只接受调用方提供的完整 `source_sha`，checkout 后再次确认：

1. `HEAD` 与输入 revision 完全相同；
2. 工作树干净；
3. `IMAGE_CREATED` 与 `SOURCE_DATE_EPOCH` 来自该提交时间；
4. OCI source 指向 `https://github.com/EltanceX/DawnlightCore-Site`；
5. Web、API、Worker 均构建为 `linux/amd64`。

三个 target 在同一 Buildx job 中串行构建。Web 使用独立 cache scope；API 和 Worker 共用 services scope，使共同 build stage 能在同一个 runner 和后续运行中复用。

## 3. Registry 与证明

固定仓库：

```text
ghcr.io/eltancex/dawnlight-web
ghcr.io/eltancex/dawnlight-api
ghcr.io/eltancex/dawnlight-worker
```

每个镜像启用：

- Docker Buildx SBOM attestation；
- `mode=max` build provenance；
- GitHub OIDC keyless attestation，并推送为 OCI registry referrer；
- Trivy `v0.74.0` High/Critical JSON 报告；
- 有修复版本的 Critical 数量必须为 `0` 的候选门禁；没有修复版本的 Critical 必须完整记录并进入人工发布审查。

High 和无修复版本的 Critical 不会被工作流静默隐藏，也不会在此阶段被误写成“已修复”。它们必须进入发布审查；任何已知可利用 High/Critical、来源不明依赖或无法解释的扫描缺口都可以由 Release Owner 拒绝该候选。不得通过覆盖同一 tag 规避门禁。

## 4. 证据 artifact

成功运行生成保留 90 天的 `deployment-images-<commit>` artifact，其中包含：

- `reports/wp9-ci-image-manifest.json`；
- Web/API/Worker 的原始 Trivy JSON；
- `reports/image-scans/summary.json`。

清单记录 source repository/ref/revision、workflow run、构建时间、平台、Web origin、tag、三个 manifest digest、不可变引用、attestation URL、扫描策略和实际计数。门禁失败时仍生成清单，但状态为 `rejected`；通过时状态为 `candidate`。两者都只是证据，不是部署批准单。

首次运行 `32559468711` 证明三个镜像、SBOM/provenance 和 OIDC attestation 均可发布，同时发现 API/Worker 的 Debian 12.15 层各有 4 个没有修复版本的 Critical（3 个 `perl-base`、1 个 `zlib1g`）。运行按最初“所有 Critical 为 0”的策略被正确拒绝。核对 Docker Hub Registry 后，仓库固定的 `node:26-bookworm-slim@sha256:cd5657…` 与官方当前 tag digest 一致，因此不能通过更新 digest 获得现成修复。后续策略明确区分可修复与无修复项，但无修复项仍阻断无人值守批准。

验证示例：

```bash
gh attestation verify \
  oci://ghcr.io/eltancex/dawnlight-web@sha256:<digest> \
  --repo EltanceX/DawnlightCore-Site
```

## 5. 按 digest 部署

审核通过后，把 artifact 中的不可变引用写入服务器受控环境文件：

```dotenv
WP9_WEB_IMAGE=ghcr.io/eltancex/dawnlight-web@sha256:<digest>
WP9_API_IMAGE=ghcr.io/eltancex/dawnlight-api@sha256:<digest>
WP9_WORKER_IMAGE=ghcr.io/eltancex/dawnlight-worker@sha256:<digest>
```

服务器只拉取和启动，不重新构建：

```bash
docker compose pull web api
docker compose up -d --no-build --wait web api edge tls-edge
```

Worker 只有在 Validator 执行隔离边界满足目标环境要求时才可加入部署。

## 6. 仍未满足的真实发布条件

- 首次成功 workflow 已确认 GHCR 可匿名 pull；独立只读拉取身份、保留策略和 digest denylist 仍须核验；
- 实际 digest 已从成功 workflow artifact 读取并在 WP9-A staging 验证；后续候选仍不得提前写入或手工伪造；
- Validator package、Core commit、CLI version、SBOM/provenance/attestation 仍是独立门禁；
- WP9-B 真实 staging、真实 OIDC、对象存储/CDN、secret manager 和实名责任清单仍未由本阶段完成；
- Production Web 必须由 Production 模式的独立受控发布流程生成，不能把当前 Preview 镜像直接改名上线。

首次成功候选、Critical 可达性审查、数据库恢复点、digest 部署、回滚和发布生命周期证据见 [V2-WP9-5](./V2-WP9-5-CandidateStagingEvidence.md)。
