# ShaderPackCli Validator image

该镜像必须从与 `LOADER_CORE_COMMIT` 完全一致且工作树干净的 DawnlightCore/Survivalcraft 源码构建。网站仓库不复制 Loader 源码或二进制。

Windows PowerShell 示例：

```powershell
$core = 'E:\sc\2.4 Rebuild\1.81-3\SurvivalcraftApi Dawnlight'
$commit = git -C $core rev-parse HEAD
docker build --pull --build-arg CORE_COMMIT=$commit `
  -f E:\Projects\webdev\dawnlight-core\infra\validator\Dockerfile `
  -t ghcr.io/eltancex/dawnlight-validator:$commit $core
docker push ghcr.io/eltancex/dawnlight-validator:$commit
docker buildx imagetools inspect ghcr.io/eltancex/dawnlight-validator:$commit
```

部署只接受 `repository@sha256:...`，不接受 tag。Worker 使用以下运行时限制：无网络、只读根文件系统、非 root、drop all capabilities、`no-new-privileges`、PID/CPU/内存/超时限制，并只读挂载单个已预检包目录。Validator 不获得数据库、S3、OIDC 或签名密钥。

当前 CLI 的稳定入口为：

```text
settings validate /input
```

Worker 将 CLI 的键值输出适配为 schema、loader、security、resource、compatibility 五个独立结果。只有退出码 0、`valid=true` 且 diagnostics 为 0 才能成为 `loader-passed`。

若构建环境无法访问 Core 的私有 NuGet 源，可由 **Core CI** 先执行固定 commit 的 `dotnet publish`，对输出目录生成 SHA-256/attestation，再以该目录作为构建上下文使用 `Dockerfile.prepublished`。该模式只接受受信 CI artifact；开发者本机产生的未证明二进制仅可用于隔离链路测试，不能推送为生产 Validator。无论采用哪种模式，部署值都必须使用 GHCR 返回的 manifest digest（`ghcr.io/eltancex/dawnlight-validator@sha256:...`），不能用 tag 或本地 image ID 代替。完整信任、权限和 attestation 门禁见 [WP9-0 决策登记](../../docs/V2-WP9-DecisionRegister.md)。
