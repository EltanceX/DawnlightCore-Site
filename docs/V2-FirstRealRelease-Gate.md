# V2 第一次真实发布门禁

状态：未满足；本文定义的是第一次邀请制真实 Beta 发布的 Go/No-Go 合同，不是当前完成声明

## 1. “第一次真实发布”的范围

第一次真实发布同时包含两个不可拆开的结果：

1. DawnlightCore Loader/Validator 的一个真实、可追溯版本及其下载制品；
2. 一名受邀真实作者的 shader pack，经真实上传、预检、Loader 验证、独立审核后进入 WP9-B 公共目录和下载 origin。

仅发布静态网站、只上传 Loader 二进制、只在 WP9-A 使用测试夹具，或手工向 published bucket 复制文件，都不算第一次真实发布。

## 2. 硬性 Go/No-Go 条件

以下任一项未满足时，Release Owner 必须给出 `NO-GO`，不得用“已知风险”口头豁免 P0 边界。

### 2.1 发布身份与范围

- 冻结 Beta 名称、版本、channel、开放时间、邀请名单和观察窗口；
- 冻结 Loader/Core commit、Contract version、CLI version、shader pack project/version；
- 记录每个下载制品的文件名、大小、SHA-256、签名和最终 URL；
- 发布说明明确 Beta 限制、受支持 Survivalcraft/API 版本、平台/架构和撤回策略；
- 禁止任何 Debug、本机绝对路径、测试账号、mock OIDC 声明或 WP9-A key 进入真实 metadata。

### 2.2 供应链与不可变制品

- Core CI 从精确 clean commit 构建 Web、API、Worker、Validator 和 Loader 下载制品；
- OCI 部署只使用 `repository@sha256:...`，不得使用可变 tag；
- GHCR package 的拉取权限、保留策略和 digest denylist 已验证；
- 每个候选有 SBOM、provenance、漏洞报告和 GitHub OIDC attestation；
- attestation 的 source、workflow、commit 和 digest 与部署记录一致；
- 无未接受的 high/critical 漏洞；任何例外有期限、owner 和 Release Owner 签字；
- 发布签名私钥来自受控 secret manager，公钥/轮换/吊销流程已记录；
- 在隔离、只读、非 root、无出站网络条件下验证 Validator digest；不得使用开发机镜像代替。

### 2.3 WP9-B 基础设施

- 使用独立真实 staging/early-Beta PostgreSQL、quarantine/published/derived bucket、OIDC client、TLS 域名和 CDN；
- quarantine 与 evidence 永不匿名公开，published 只经 CDN/API 策略出口；
- service account 最小权限、secret 轮换和访问日志已验证；
- 数据库 migration 在生产同版本快照上 rehearsal 通过，并有向前修复策略；
- 自动备份、保留期、加密和一次完整恢复演练通过，记录 RPO/RTO；
- 单 API 实例的非 HA 限制已写入 Beta 说明；入口共享限流和可信 proxy hop 已验证；
- 监控覆盖 live/ready、5xx、发布/验证队列、对象存储、数据库容量、下载错误和证书到期；告警能送达 primary/backup。

### 2.4 真实验证与内容发布

- 真实 shader pack ZIP 先进入 quarantine，预检危险 fixture、zip bomb、路径穿越和尺寸限制测试通过；
- Validator 使用冻结 digest 运行真实 Loader CLI，并记录 Core commit、CLI version、输入 SHA-256、退出码和结构化 sections；
- Validator timeout、OOM、非零退出、无网络与 workspace 清理均在 WP9-B 演练；
- 作者不能审核自己的 submission；Reviewer 对 license、metadata、兼容性声明和验证结果签字；
- 发布事务产生唯一 artifact key、目录投影和已签名 feed；同一 submission 重试不产生重复公开身份；
- 浏览器、API 与直接下载均核对最终对象的大小、SHA-256、content type 和缓存策略；
- 未通过、待审、撤回、taken-down、私有草稿和 quarantine URL 不出现在搜索、feed、站点地图或日志响应中。

### 2.5 撤回、紧急下架与回滚

- ordinary withdraw：一个 feed TTL 内离开目录/搜索/推荐，新下载失败，历史 URL 按公告策略处理；
- takedown：数据库阻断、CDN 精确 purge/deny 和已知 URL `404/410` 全部实测；仅改变数据库状态不合格；
- P0 演练达到 15 分钟确认、60 分钟公开阻断目标；
- evidence bucket 的访问、hash 核验、保留例外和删除审批经过验证；
- 对象存储故障、队列积压、Validator timeout、数据库不可用、错误候选部署和应用回滚演练通过；
- 上一版本镜像 digest、数据库兼容性、回滚命令、负责人和触发阈值写入发布单；
- 回滚不复用或覆盖已发布 artifact key；签名 feed 能明确撤回/替代关系。

### 2.6 人员、法律与隐私

- Release Owner、Core Supply-chain Maintainer、Infrastructure Operator、Incident Commander、Reviewer Lead、Privacy & Abuse Owner 均有实名 primary/backup；
- 至少两名 platform-admin 完成恢复访问验证；受控值班清单记录时区、联系方式、确认/失效日期；
- 服务条款、隐私说明、上传许可、第三方许可证、版权/举报入口和响应责任已审核；
- 下载统计的数据最小化、90 天保留/清理、导出/删除和访问权限已验证；
- 真实作者明确同意 Beta 范围、数据处理和内容分发授权；测试记录不公开联系人或原始私有包。

### 2.7 参与者验收与最终签字

- 至少一名非开发者维护者完成：查文档、下载 Loader、核对 hash、诊断配置和报告问题；
- 至少一名真实作者完成：登录、创建项目、上传、理解预检/Loader 结果、修订、提交审核、发布和撤回；
- 记录任务完成率、阻塞、误导文案和严重度；所有 P0 关闭，P1 有 owner 与明确期限；
- 观察窗口内无签名失败、私有数据泄漏、不可恢复队列或错误公开 artifact；
- Infrastructure Operator、Reviewer Lead、Privacy & Abuse Owner 提交各自验收结果；Release Owner 最后记录 `GO`、确切 digest 和发布时间。

## 3. 当前差距（WP9-3 时点）

| 能力 | 当前状态 | 真实发布前缺口 |
| --- | --- | --- |
| Web/API/Worker 可复现容器定义 | 首次 CI 候选与 WP9-A digest 部署已验证 | GHCR 匿名 pull、attestation、健康、应用回滚与发布生命周期已实测；仍缺 package 保留/denylist、独立 pull 身份和 WP9-B 复验 |
| 发布/撤回/takedown 数据与 API | 第一层已实现 | 需 WP9-B 真实 provider、真实 CDN 和候选制品复验 |
| 队列积压/对象存储故障/可见性回滚 | WP9-A arch-vm 六项演练已通过 | 需在 WP9-B clean Registry 候选环境重跑 |
| Validator/Loader | 不满足 | 缺可信 Validator digest、真实 Loader CLI/Core commit 和 timeout/OOM 证据 |
| 数据库与对象存储 | 部分满足 | 缺独立 provider、备份恢复、RPO/RTO 和最小权限证明 |
| OIDC/TLS/CDN | 不满足 | 当前仅 mock OIDC/HTTP/Caddy；需真实 client、TLS、CDN purge/deny 与共享限流 |
| 运营责任 | 不满足 | 缺实名 primary/backup、两名 platform-admin 和值班确认 |
| 法律/隐私 | 部分满足 | 技术最小化已实现；仍需条款、许可、版权流程和责任人审核 |
| 真实参与者任务 | 不满足 | 尚未邀请真实维护者/作者完成端到端验收 |
| 最终 Go/No-Go | 不满足 | 以上硬门禁完成后才能签字 |

结论：当前代码适合继续进入 WP9-B 建设和候选演练，但不适合第一次真实发布。最大阻断项不是页面功能，而是可信 Validator/Loader 供应链、独立真实基础设施、CDN/takedown 证据、备份恢复和运营责任人。

## 4. 建议的首次发布顺序

1. 建立 WP9-B provider、secret manager、OIDC/TLS/CDN 和受控责任清单；
2. 从 clean Core commit 构建并登记所有 Registry digest 与 Loader 下载 artifact；
3. 导入 Contract，执行 migration、备份恢复和 read-only smoke；
4. 运行危险上传、真实 Validator、对象存储/队列/timeout/回滚/takedown 全套演练；
5. 冻结唯一候选，不再接受无审计的手工替换；
6. 邀请维护者和作者完成观察任务，关闭 P0/P1；
7. 召开 Go/No-Go，签署不可变发布记录；
8. 先开放极小邀请名单，观察一个稳定周期，再单独决定扩容或 V2.2。

## 5. 最小发布记录

最终发布单至少保存：

```text
release-id / channel / window
web-api-worker-validator image digests
loader file / size / sha256 / signature / URL
core commit / contract version / CLI version
shader project / version / input sha256 / published object key
migration version / backup ID / restore drill ID
OIDC issuer / public origin / CDN distribution ID（不含 secret）
publish-withdraw-takedown-rollback drill report IDs
open P1 risks with owner and deadline
role acknowledgements and Release Owner GO/NO-GO
```

发布记录只引用受控证据位置，不复制 secret、私有原因、作者联系人或 evidence 原包。
