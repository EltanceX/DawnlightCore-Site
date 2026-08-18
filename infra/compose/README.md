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
