# V2 本地依赖环境

`v2-dev.compose.yml` 只用于本地开发和集成测试，提供：

- PostgreSQL `127.0.0.1:55432`；
- MinIO S3 API `127.0.0.1:59000`；
- MinIO Console `127.0.0.1:59001`。

启动：

```powershell
docker compose -f infra/compose/v2-dev.compose.yml up -d
pnpm db:migrate
pnpm db:seed
```

停止并删除本地数据：

```powershell
docker compose -f infra/compose/v2-dev.compose.yml down -v
```

该文件不包含生产密钥、生产 bucket、外网域名或真实作者内容。staging/production 必须使用独立 provider、secret 和 bucket，禁止复用本地凭据。

## WP9-A 工程演练

`wp9-a.compose.yml` 是 arch-vm 的隔离 Beta 工程拓扑，不是 production 配置。它从 `wp9-a.env` 获取随机测试凭据、构建元数据、公开 origin、Docker GID 和 Validator workspace 绝对路径；环境文件由 `pnpm wp9:env -- ...` 生成并被 Git 忽略。

完整运行步骤、安全边界和退出条件见 `docs/V2-WP9-1-Implementation.md`。提交前至少运行：

```powershell
pnpm wp9:check
pnpm check
```

Validator 在模板中默认禁用。不得用 tag、空 digest 或本机开发制品启用 Loader 验证。

WP9-2 起，`/artifacts/*` 必须经过 API 状态门禁；不要为 MinIO 增加宿主机端口或匿名 published bucket。第一层 takedown 演练见 `docs/V2-WP9-2-Implementation.md`。
