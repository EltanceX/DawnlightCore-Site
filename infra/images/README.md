# DawnlightCore 部署镜像

本目录包含 WP9-1 的可部署镜像定义：

- `Dockerfile.web`：构建 Next.js 静态输出，并以非 root Caddy 提供服务；
- `Dockerfile.services`：提供 `api` 和 `worker` 两个非 root target；
- `web.Caddyfile`：Web origin 的只读静态文件和缓存规则。

基础镜像必须使用 manifest digest 固定。构建参数 `IMAGE_REVISION`、`IMAGE_CREATED` 和 `SOURCE_DATE_EPOCH` 必须来自同一个 clean commit；运行时 OCI 标签由部署清单校验。

WP9-A 的本地标签仅用于隔离演练。发布到 Registry 后必须记录 manifest digest，部署引用不得退回 tag。Validator 镜像遵循 `infra/validator/README.md` 的独立 Core 供应链规则。

网站部署镜像由 `.github/workflows/publish-images.yml` 在 Quality 门禁成功后发布到 `ghcr.io/eltancex/dawnlight-{web,api,worker}`。工作流只发布完整 commit 派生的不可变 tag，并生成 SBOM、provenance、GitHub OIDC attestation、Trivy 报告和 `deployment-images-<commit>` 候选清单。完整边界见 `docs/V2-WP9-4-ImageSupplyChain.md`。
