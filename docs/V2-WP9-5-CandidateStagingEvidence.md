# V2-WP9-5：CI 候选镜像 staging 提升与演练证据

状态：WP9-A 技术验证通过；Production 与 WP9-B 仍为 `NO-GO`

日期：2026-08-22

## 1. 范围与结论

本记录把首次通过自动镜像门禁的 Web/API/Worker 候选部署到 `core.eltancex.top` 的 WP9-A Preview staging，并完成健康、回滚、普通撤回、对象存储故障和重试恢复演练。

该环境仍使用单 API、单 Worker、Mock OIDC、测试密钥和本机 PostgreSQL/MinIO，`LOADER_VALIDATOR_ENABLED=false`。演练只使用预验证测试 ZIP，不接触真实作者或真实 shader pack。因此结论严格限定为：

- CI 候选镜像可以被匿名只读拉取并按 manifest digest 启动；
- 三个运行容器的 source revision、非 root 用户和 digest 与 CI 清单一致；
- 当前 WP9-A 发布生命周期和应用回滚在该候选上可重复执行；
- 本记录不是漏洞例外签字、WP9-B 验收或第一次真实发布批准。

## 2. 候选身份与供应链

| 字段 | 值 |
| --- | --- |
| source revision | `68d13a80ba18ee042058ca4e52a2f26c348ea383` |
| GitHub Actions run | [`32560285066`](https://github.com/EltanceX/DawnlightCore-Site/actions/runs/32560285066)，结论 `success` |
| candidate manifest | `deployment-images-68d13a80ba18ee042058ca4e52a2f26c348ea383` |
| manifest artifact ID | `9472674236` |
| candidate status | `candidate`，不是 deployment approval |
| target platform | `linux/amd64` |
| Web origin/mode | `https://core.eltancex.top` / `preview` |

不可变部署引用：

```text
ghcr.io/eltancex/dawnlight-web@sha256:8b05109b220c290342f33f4c124177c78fee24d257f46656dbc5dd589ad75676
ghcr.io/eltancex/dawnlight-api@sha256:e6ce41cb655ad3e33407f63c649d35a772f400b18b4d3ac9d821dfacc6eb0c13
ghcr.io/eltancex/dawnlight-worker@sha256:ca9ee186804eb3a53983c346e44b649b8b80109b9062ef7d7a232ed92d28b2c3
```

三份 GitHub OIDC attestation 分别为 `42300422`、`42300428` 和 `42300430`，已使用 `gh attestation verify oci://... --repo EltanceX/DawnlightCore-Site` 实际验证。服务器未登录 GHCR 即可拉取三个引用，证明当前 package 允许匿名 pull；保留策略、denylist 和独立只读 service account 尚未验证。

服务器镜像清单保存为 `/srv/dawnlight-test/evidence/68d13a8-image-manifest.json`，SHA-256 为 `bf7ac62cb6c3750200748d73f4a7071a0ace7a6eef49d53e8004a80b285f3ed2`。清单确认：

| 服务 | 运行用户 | Docker 报告的镜像大小 | 状态 |
| --- | --- | ---: | --- |
| Web | `65532:65532` | 28,482,968 B | healthy |
| API | `10001:10001` | 89,571,320 B | healthy |
| Worker | `10001:10001` | 106,668,685 B | healthy |

## 3. Critical 技术审查

Trivy 原始结果为 Web `19 High / 0 Critical`、API `30 High / 4 Critical`、Worker `38 High / 4 Critical`。API 与 Worker 的四个 Critical 完全相同，均来自 Debian Bookworm 基础层，且扫描时 `FixedVersion` 为空。

服务镜像内实测：平台为 `x86_64`；`perl-base=5.36.0-7+deb12u3`；`zlib1g:amd64=1:1.2.13.dfsg-1`；`Archive::Tar` 模块不存在；未发现 MiniZip 文件。源码检索确认 API/Worker 入口均为 Node，ZIP 预检与提取使用 `yauzl`，唯一的子进程调用是 Worker 按 digest 启动隔离 Validator 容器，没有调用 Perl。

| CVE | Debian Bookworm 状态 | 当前候选可达性判断 | WP9-A 技术处置 |
| --- | --- | --- | --- |
| [CVE-2026-13221](https://security-tracker.debian.org/tracker/CVE-2026-13221) | vulnerable；尚无 Bookworm 修复 | 需要编译超过 65,535 个固定分支的 Perl 正则；应用不调用 Perl，未发现输入到 Perl 正则的路径 | 仅 WP9-A 临时接受；基础镜像或 Debian 状态变化即重扫 |
| [CVE-2026-42496](https://security-tracker.debian.org/tracker/CVE-2026-42496) | postponed；Archive::Tar 3.08 前 symlink traversal | 镜像中 `Archive::Tar` 不存在；产品只接受 ZIP 并由 `yauzl` 处理，不接受 Perl TAR 提取路径 | 当前产品路径不可达；继续保留扫描项 |
| [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376) | no-dsa；Bookworm 暂无修复 | 漏洞限定 32 位 Perl build；当前候选固定为 `linux/amd64` / `x86_64` | 对当前平台不适用；增加新架构时必须重审 |
| [CVE-2023-45853](https://security-tracker.debian.org/tracker/CVE-2023-45853) | Bookworm 对 src:zlib 标记 ignored | Debian 说明 Bookworm 的 zlib 不构建受影响的 contrib/minizip；镜像中也未发现 MiniZip | 对当前二进制组成不适用；继续跟踪包映射变化 |

以上是可达性分析，不是把漏洞改写为“已修复”。Production 例外仍缺以下必填项：

```text
exception owner: PENDING
expiry/review date: PENDING
Release Owner acknowledgement: PENDING
High findings review: PENDING
Production disposition: NO-GO
```

用户要求继续 staging 技术测试只授权本次 WP9-A 工程验证，不替代 Release Owner 的风险接受。

## 4. 部署与恢复点

部署前状态：Web 使用本地 `dawnlight-web:wp9-a`，API 使用本地 `dawnlight-api:wp9-a`，Worker 未运行；对外 Preview smoke 通过。

部署前创建 PostgreSQL 自定义格式快照：

```text
/srv/dawnlight-test/backups/pre-68d13a8-20260822T085236Z.dump
sha256:f7491420213d3ed2c9fff5dbdb4f141a961de1cbdc3688757d9f5f84e7f1fc13
```

服务器从 GitHub clone 精确提交到 `/srv/dawnlight-test/releases/68d13a8`，确认 `HEAD` 完全匹配且 Git 工作树干净。受控环境文件沿用原 WP9-A secret，只替换构建元数据和三个不可变镜像引用；Validator 保持禁用。Compose `config --quiet` 通过后使用 `--no-build --wait` 启动。

启动后验证：

- Web/API/Worker 均为 `healthy`，容器 `Config.Image` 和本地 repo digest 与 CI 清单逐字一致；
- `/`、`/zh-CN/`、`/zh-CN/author/`、`/health/live`、`/health/ready`、Contract 与搜索均返回 `200`；
- 缺失 artifact 返回 `404`；Mock OIDC live 与 discovery 返回 `200`；
- TLS edge 保留 CSP Report-Only 和 `X-Robots-Tag: noindex, nofollow`。

## 5. 应用镜像回滚演练

在数据库 migration 无差异且已有快照的前提下执行：

1. Web/API 切回部署前本地镜像，Worker 恢复为停止状态；
2. 等待 Web/API healthy，并验证主页、live、ready、Contract 均为 `200`；
3. Web/API/Worker 再切回三个候选 digest；
4. 等待三者 healthy，重复相同 smoke。

结果：回滚用时 18 秒，候选恢复用时 33 秒，所有断言通过。脱敏日志保存于 `/srv/dawnlight-test/evidence/68d13a8-rollback-drill.txt`，SHA-256 为 `82cb7ce1435c96b0dfd79a8a2a61cd8052bced4b6efe047ce92c9006b438a8eb`。

该演练证明应用容器回滚，不等价于数据库备份恢复；本次没有 schema 变化，也没有执行 restore。

## 6. 发布、撤回与故障演练

候选镜像上运行既有 `run-wp9-a-release-drill.mjs`，run ID 为 `2026-08-22-62fc54da70`，六项检查全部通过：

| 检查 | 结果 | 关键断言 |
| --- | --- | --- |
| publication queue backlog | 通过 | Worker 停止时保留一个未调度 outbox |
| complete publication | 通过 | artifact/feed 各一；公开 URL `200`；下载 resolver `302` |
| ordinary withdrawal | 通过 | 新下载 `404`；已知 URL `200 + withdrawn`；announcement/audit 各一 |
| object storage readiness fault | 通过 | MinIO 停止后 readiness `503` |
| failed publication visibility rollback | 通过 | artifact/directory/feed 均未公开；已知 URL `404` |
| publication retry recovery | 通过 | 一个失败 run 后只产生一个 completed run、artifact 与 feed；公开 URL 恢复 `200` |

报告保存于 `/srv/dawnlight-test/evidence/68d13a8-release-drill.json`，SHA-256 为 `22343be90cb61927e2b907f5381a44ad01e14530fe8d18ff326f1a1a564eee1d`。报告自身保持：

```json
{
  "evidenceClass": "engineering-only",
  "candidateEvidence": false,
  "validatorMode": "prevalidated-fixture"
}
```

演练结束后 MinIO、Web、API、Worker、PostgreSQL、Mock OIDC、edge 和 TLS edge 均恢复健康，最终公开 smoke 全部为 `200`。

## 7. Go/No-Go 与下一步

| 范围 | 结论 | 原因 |
| --- | --- | --- |
| 继续 WP9-A 工程测试 | GO | digest、attestation、启动、健康、回滚、撤回和故障恢复均有证据 |
| WP9-B 邀请真实作者 | NO-GO | 缺可信 Validator、真实 OIDC/S3/CDN、备份 restore、实名责任清单与完整漏洞签字 |
| Production | NO-GO | 当前 Web 是 Preview 构建；High/Critical 人工接受未完成；环境不是生产拓扑 |

下一阶段应建立真正独立的 WP9-B provider：受控 secret manager、真实 OIDC client、独立数据库与 bucket、CDN 精确 purge/deny、备份恢复、可信 Validator digest 和实名 primary/backup。完成这些外部门禁后，才能对同一个冻结候选重新开展邀请制验收。
