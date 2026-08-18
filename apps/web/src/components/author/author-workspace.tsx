"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type {
  AuditEventSummary,
  AuthorProject,
  AuthorVersion,
  AuthorUpload,
  AuthorUploadCreateResponse,
  AuthorUploadCompleteResponse,
  InvitationWithToken,
  SessionPrincipal,
} from "@dawnlight/api-client";
import {
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  CopyButton,
  StatusBadge,
  ToolEmptyState,
} from "@/components/developer-tools/tool-shared";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

type WorkspaceState =
  "unconfigured" | "loading" | "signed-out" | "ready" | "error";
type ApiErrorBody = { error?: { code?: string; message?: string } };

const splitList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export function AuthorWorkspace() {
  const [status, setStatus] = useState<WorkspaceState>(
    siteConfig.apiOrigin ? "loading" : "unconfigured",
  );
  const [session, setSession] = useState<SessionPrincipal | null>(null);
  const [projects, setProjects] = useState<AuthorProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState<InvitationWithToken | null>(
    null,
  );
  const [audit, setAudit] = useState<AuditEventSummary[]>([]);
  const [uploads, setUploads] = useState<Record<string, AuthorUpload>>({});

  const apiRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${siteConfig.apiOrigin}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(
          `${body.error?.code ?? `HTTP ${response.status}`}：${body.error?.message ?? "请求失败"}`,
        );
      }
      return ((await response.json()) as { data: T }).data;
    },
    [],
  );

  const loadWorkspace = useCallback(async () => {
    if (!siteConfig.apiOrigin) return;
    setStatus("loading");
    setMessage("");
    try {
      const current = await apiRequest<SessionPrincipal>(
        "/api/v1/auth/session",
      );
      const nextProjects = await apiRequest<AuthorProject[]>(
        "/api/v1/author/projects",
      );
      setSession(current);
      setProjects(nextProjects);
      setSelectedId((value) =>
        nextProjects.some((project) => project.id === value)
          ? value
          : (nextProjects[0]?.id ?? ""),
      );
      setStatus("ready");
    } catch (error) {
      const text = error instanceof Error ? error.message : "作者 API 不可用";
      if (
        text.startsWith("AuthenticationRequired") ||
        text.startsWith("HTTP 401")
      ) {
        setSession(null);
        setProjects([]);
        setStatus("signed-out");
      } else {
        setMessage(text);
        setStatus("error");
      }
    }
  }, [apiRequest]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const mutate = async <T,>(path: string, method: string, body: unknown) => {
    if (!session) throw new Error("会话尚未建立");
    return apiRequest<T>(path, {
      method,
      headers: {
        "x-csrf-token": session.csrfToken,
        "idempotency-key": `${method.toLowerCase()}-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
    });
  };

  const runMutation = async (action: () => Promise<void>) => {
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    }
  };

  const uploadFile = async (version: AuthorVersion, file: File) => {
    if (!session) throw new Error("会话尚未建立");
    const created = await mutate<AuthorUploadCreateResponse>(
      `/api/v1/author/projects/${version.projectId}/versions/${version.id}/uploads`,
      "POST",
      {
        fileName: file.name,
        size: file.size,
        contentType: file.type || "application/zip",
      },
    );
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", created.uploadUrl);
      request.setRequestHeader("content-type", file.type || "application/zip");
      request.onload = () =>
        request.status >= 200 && request.status < 300
          ? resolve()
          : reject(new Error(`隔离区直传失败（HTTP ${request.status}）`));
      request.onerror = () => reject(new Error("隔离区直传网络错误"));
      request.send(file);
    });
    const completed = await mutate<AuthorUploadCompleteResponse>(
      `/api/v1/author/uploads/${created.uploadId}/complete`,
      "POST",
      {},
    );
    let status = await apiRequest<AuthorUpload>(
      `/api/v1/author/uploads/${completed.uploadId}`,
    );
    for (let attempt = 0; attempt < 60; attempt++) {
      if (
        ["passed", "rejected", "infrastructure-error", "expired"].includes(
          status.status,
        )
      )
        break;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      status = await apiRequest<AuthorUpload>(
        `/api/v1/author/uploads/${completed.uploadId}`,
      );
    }
    setUploads((current) => ({ ...current, [version.id]: status }));
  };

  if (status === "unconfigured") {
    return (
      <section className="dl-author-gate" aria-label="作者 API 未配置">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2>当前静态预览未连接作者 API</h2>
          <p>
            设置 <code>NEXT_PUBLIC_API_ORIGIN</code> 并在 API 环境启用 OIDC
            后，登录和私有草稿才会开放。页面不会使用构建期 fixture
            模拟私人账户或项目。
          </p>
        </div>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <ToolEmptyState title="正在读取私有会话">
        作者数据不会进入公共缓存。
      </ToolEmptyState>
    );
  }

  if (status === "signed-out") {
    const login = `${siteConfig.apiOrigin}/api/v1/auth/oidc/start?returnTo=${encodeURIComponent("/zh-CN/author/")}`;
    return (
      <section className="dl-author-gate" aria-label="作者登录">
        <LogIn size={22} aria-hidden="true" />
        <div>
          <h2>邀请制 OIDC 登录</h2>
          <p>
            首次登录必须携带有效账户邀请；已有作者可以直接通过配置的 provider
            登录。
          </p>
          <a className="dl-button dl-button--primary" href={login}>
            使用 OIDC 登录
          </a>
          <form
            action={`${siteConfig.apiOrigin}/api/v1/auth/oidc/start`}
            className="dl-author-login-form"
            method="post"
          >
            <input name="returnTo" type="hidden" value="/zh-CN/author/" />
            <label>
              <span>首次登录的账户邀请 token（不会进入 URL）</span>
              <input autoComplete="off" name="invite" />
            </label>
            <button className="dl-button dl-button--secondary" type="submit">
              携带邀请登录
            </button>
          </form>
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <ToolEmptyState title="作者 API 暂时不可用">
        {message} <button onClick={() => void loadWorkspace()}>重新连接</button>
      </ToolEmptyState>
    );
  }

  if (!session) return null;

  return (
    <div className="dl-author-workspace">
      <header className="dl-author-session">
        <div>
          <span>已登录</span>
          <strong>{session.user.displayName}</strong>
          <small>{session.user.email}</small>
        </div>
        <div>
          {session.user.isPlatformAdmin && (
            <StatusBadge status="platform-admin" />
          )}
          <Button
            onClick={() => void loadWorkspace()}
            type="button"
            variant="quiet"
          >
            <RefreshCcw size={15} aria-hidden="true" /> 刷新
          </Button>
          <Button
            onClick={() =>
              void runMutation(async () => {
                await mutate("/api/v1/auth/logout", "POST", {});
                setSession(null);
                setProjects([]);
                setStatus("signed-out");
              })
            }
            type="button"
            variant="quiet"
          >
            <LogOut size={15} aria-hidden="true" /> 退出
          </Button>
        </div>
      </header>

      {message && (
        <p className="dl-author-message" role="alert">
          {message}
        </p>
      )}

      <section className="dl-author-section">
        <div className="dl-author-section__heading">
          <div>
            <span>Projects</span>
            <h2>项目草稿</h2>
          </div>
          <StatusBadge status={`${projects.length} projects`} />
        </div>
        <div className="dl-author-project-layout">
          <nav className="dl-author-project-list" aria-label="作者项目">
            {projects.map((project) => (
              <button
                aria-current={selectedId === project.id ? "true" : undefined}
                key={project.id}
                onClick={() => {
                  setSelectedId(project.id);
                  setAudit([]);
                }}
                type="button"
              >
                <strong>{project.name}</strong>
                <span>
                  {project.role} · {project.status}
                </span>
              </button>
            ))}
            {projects.length === 0 && <p>还没有项目。创建后你将成为 owner。</p>}
          </nav>
          <CreateProjectForm
            onCreate={(body) =>
              runMutation(async () => {
                const project = await mutate<AuthorProject>(
                  "/api/v1/author/projects",
                  "POST",
                  body,
                );
                setProjects((current) => [project, ...current]);
                setSelectedId(project.id);
              })
            }
          />
        </div>
      </section>

      {selected && (
        <ProjectEditor
          audit={audit}
          invitation={invitation}
          onAudit={() =>
            runMutation(async () => {
              setAudit(
                await apiRequest<AuditEventSummary[]>(
                  `/api/v1/author/projects/${selected.id}/audit`,
                ),
              );
            })
          }
          onInvite={(body) =>
            runMutation(async () => {
              const result = await mutate<InvitationWithToken>(
                `/api/v1/author/projects/${selected.id}/invitations`,
                "POST",
                body,
              );
              setInvitation(result);
            })
          }
          onVersion={(body) =>
            runMutation(async () => {
              const version = await mutate<AuthorVersion>(
                `/api/v1/author/projects/${selected.id}/versions`,
                "POST",
                body,
              );
              setProjects((current) =>
                current.map((project) =>
                  project.id === selected.id
                    ? { ...project, versions: [version, ...project.versions] }
                    : project,
                ),
              );
            })
          }
          project={selected}
          uploadStatuses={uploads}
          onUpload={(version, file) =>
            runMutation(() => uploadFile(version, file))
          }
        />
      )}

      <section className="dl-author-section dl-author-grid">
        <InviteAcceptanceForm
          onAccept={(token) =>
            runMutation(async () => {
              const project = await mutate<AuthorProject>(
                "/api/v1/author/invitations/accept",
                "POST",
                { token },
              );
              setProjects((current) => [
                project,
                ...current.filter((item) => item.id !== project.id),
              ]);
              setSelectedId(project.id);
            })
          }
        />
        {session.user.isPlatformAdmin && (
          <AccountInvitationForm
            invitation={invitation}
            onInvite={(email) =>
              runMutation(async () => {
                setInvitation(
                  await mutate<InvitationWithToken>(
                    "/api/v1/auth/invitations",
                    "POST",
                    { email },
                  ),
                );
              })
            }
          />
        )}
      </section>
    </div>
  );
}

function CreateProjectForm({
  onCreate,
}: {
  onCreate: (body: object) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onCreate({
      slug: form.get("slug"),
      name: form.get("name"),
      summary: form.get("summary"),
      licenseSpdx: form.get("license") || null,
    });
  };
  return (
    <form className="dl-author-form" onSubmit={(event) => void submit(event)}>
      <h3>创建项目</h3>
      <label>
        <span>Slug</span>
        <input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
      </label>
      <label>
        <span>名称</span>
        <input name="name" required />
      </label>
      <label>
        <span>摘要</span>
        <textarea minLength={10} name="summary" required />
      </label>
      <label>
        <span>SPDX 许可证</span>
        <input name="license" placeholder="MIT；不确定可留空" />
      </label>
      <Button type="submit">
        <Plus size={15} aria-hidden="true" /> 创建私有草稿
      </Button>
    </form>
  );
}

function ProjectEditor({
  project,
  onVersion,
  onInvite,
  invitation,
  onAudit,
  audit,
  uploadStatuses,
  onUpload,
}: {
  project: AuthorProject;
  onVersion: (body: object) => Promise<void>;
  onInvite: (body: object) => Promise<void>;
  invitation: InvitationWithToken | null;
  onAudit: () => Promise<void>;
  audit: AuditEventSummary[];
  uploadStatuses: Record<string, AuthorUpload>;
  onUpload: (version: AuthorVersion, file: File) => Promise<void>;
}) {
  const writable = project.role === "owner" || project.role === "maintainer";
  const submitVersion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fileName = String(form.get("fileName") ?? "").trim();
    await onVersion({
      version: form.get("version"),
      channel: form.get("channel"),
      changelog: form.get("changelog"),
      licenseSpdx: form.get("license") || null,
      compatibility: [
        {
          coreRange: form.get("coreRange"),
          gameApiTag: form.get("gameApiTag"),
          platforms: splitList(String(form.get("platforms") ?? "")),
          architectures: splitList(String(form.get("architectures") ?? "")),
          gpuClasses: splitList(String(form.get("gpuClasses") ?? "")),
          note: form.get("note"),
        },
      ],
      artifactDeclarations: fileName
        ? [
            {
              fileName,
              platform: form.get("artifactPlatform"),
              architecture: form.get("artifactArchitecture"),
              gpuClass: form.get("artifactGpu"),
              expectedSize: null,
            },
          ]
        : [],
    });
  };
  return (
    <section className="dl-author-section">
      <div className="dl-author-section__heading">
        <div>
          <span>{project.slug}</span>
          <h2>{project.name}</h2>
        </div>
        <StatusBadge status={project.role} />
      </div>
      <p>{project.summary}</p>
      {!writable && (
        <p className="dl-author-message">
          Reviewer 可以读取草稿与审计记录，但不能修改项目或版本。
        </p>
      )}
      <div className="dl-author-grid">
        <form
          className="dl-author-form"
          onSubmit={(event) => void submitVersion(event)}
        >
          <h3>新建版本草稿</h3>
          <label>
            <span>版本</span>
            <input
              disabled={!writable}
              name="version"
              placeholder="3.2.0-preview"
              required
            />
          </label>
          <label>
            <span>频道</span>
            <select disabled={!writable} name="channel">
              <option value="preview">preview</option>
              <option value="alpha">alpha</option>
              <option value="beta">beta</option>
              <option value="stable">stable</option>
            </select>
          </label>
          <label>
            <span>Changelog</span>
            <textarea disabled={!writable} name="changelog" />
          </label>
          <label>
            <span>SPDX 许可证</span>
            <input disabled={!writable} name="license" />
          </label>
          <fieldset disabled={!writable}>
            <legend>兼容性声明（尚未验证）</legend>
            <label>
              <span>Core range</span>
              <input name="coreRange" required />
            </label>
            <label>
              <span>Game API</span>
              <input name="gameApiTag" required />
            </label>
            <label>
              <span>平台，逗号分隔</span>
              <input name="platforms" />
            </label>
            <label>
              <span>架构，逗号分隔</span>
              <input name="architectures" />
            </label>
            <label>
              <span>GPU 能力，逗号分隔</span>
              <input name="gpuClasses" />
            </label>
            <label>
              <span>说明</span>
              <textarea name="note" />
            </label>
          </fieldset>
          <fieldset disabled={!writable}>
            <legend>Artifact 预声明（可选）</legend>
            <label>
              <span>文件名</span>
              <input name="fileName" />
            </label>
            <label>
              <span>平台</span>
              <input name="artifactPlatform" />
            </label>
            <label>
              <span>架构</span>
              <input name="artifactArchitecture" />
            </label>
            <label>
              <span>GPU 类别</span>
              <input name="artifactGpu" />
            </label>
          </fieldset>
          <Button disabled={!writable} type="submit">
            <Plus size={15} aria-hidden="true" /> 保存版本草稿
          </Button>
        </form>
        <div className="dl-author-stack">
          <div className="dl-author-panel">
            <h3>版本</h3>
            {project.versions.length === 0 ? (
              <p>暂无版本草稿。</p>
            ) : (
              project.versions.map((version) => (
                <article className="dl-author-version" key={version.id}>
                  <strong>{version.version}</strong>
                  <StatusBadge status={version.status} />
                  <span>
                    {version.channel} · revision {version.revision}
                  </span>
                  <p>{version.changelog || "未填写 changelog"}</p>
                  <small>
                    {version.artifactDeclarations.length} 个 artifact
                    预声明；未上传、未验证
                  </small>
                  {writable && (
                    <UploadPanel
                      onUpload={(file) => onUpload(version, file)}
                      upload={uploadStatuses[version.id] ?? null}
                    />
                  )}
                </article>
              ))
            )}
          </div>
          {project.role === "owner" && (
            <TeamInvitationForm invitation={invitation} onInvite={onInvite} />
          )}
          <div className="dl-author-panel">
            <div className="dl-author-inline">
              <h3>审计摘要</h3>
              <Button
                onClick={() => void onAudit()}
                type="button"
                variant="quiet"
              >
                读取
              </Button>
            </div>
            {audit.map((event) => (
              <p className="dl-author-audit" key={event.id}>
                <strong>{event.action}</strong>
                <span>
                  {event.outcome} · {event.requestId}
                </span>
              </p>
            ))}
            {audit.length === 0 && <p>按需从私有 API 读取，不进入公共缓存。</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamInvitationForm({
  invitation,
  onInvite,
}: {
  invitation: InvitationWithToken | null;
  onInvite: (body: object) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onInvite({ email: form.get("email"), role: form.get("role") });
  };
  return (
    <form
      className="dl-author-form dl-author-panel"
      onSubmit={(event) => void submit(event)}
    >
      <h3>
        <Users size={16} aria-hidden="true" /> 邀请团队成员
      </h3>
      <label>
        <span>OIDC 邮箱</span>
        <input name="email" type="email" required />
      </label>
      <label>
        <span>角色</span>
        <select name="role">
          <option value="maintainer">maintainer</option>
          <option value="reviewer">reviewer</option>
        </select>
      </label>
      <Button type="submit" variant="secondary">
        创建一次性邀请
      </Button>
      {invitation?.projectId && <TokenResult invitation={invitation} />}
    </form>
  );
}

function UploadPanel({
  upload,
  onUpload,
}: {
  upload: AuthorUpload | null;
  onUpload: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("shaderArchive");
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    setBusy(true);
    try {
      await onUpload(input.files[0]);
      event.currentTarget.reset();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dl-author-upload">
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>上传 .zip 到隔离区</span>
          <input
            accept=".zip,application/zip"
            name="shaderArchive"
            type="file"
          />
        </label>
        <Button disabled={busy} type="submit" variant="secondary">
          {busy ? "直传并预检中…" : "开始直传"}
        </Button>
      </form>
      {upload && (
        <div className="dl-author-upload-status" role="status">
          <StatusBadge status={upload.status} />
          <span>
            {upload.fileName} · {upload.objectSize ?? upload.expectedSize} bytes
          </span>
          {upload.inputSha256 && <code>{upload.inputSha256}</code>}
          {upload.diagnostics.length > 0 && (
            <ul>
              {upload.diagnostics.slice(0, 5).map((item) => (
                <li key={`${item.code}-${item.path ?? "root"}`}>
                  <strong>{item.code}</strong>：{item.message}
                  {item.path && <code> {item.path}</code>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function InviteAcceptanceForm({
  onAccept,
}: {
  onAccept: (token: string) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAccept(
      String(new FormData(event.currentTarget).get("token") ?? ""),
    );
  };
  return (
    <form
      className="dl-author-form dl-author-panel"
      onSubmit={(event) => void submit(event)}
    >
      <h3>接受项目邀请</h3>
      <p>邀请邮箱必须与当前 OIDC 已验证邮箱一致。</p>
      <label>
        <span>一次性 token</span>
        <input name="token" required />
      </label>
      <Button type="submit" variant="secondary">
        接受邀请
      </Button>
    </form>
  );
}

function AccountInvitationForm({
  invitation,
  onInvite,
}: {
  invitation: InvitationWithToken | null;
  onInvite: (email: string) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onInvite(
      String(new FormData(event.currentTarget).get("email") ?? ""),
    );
  };
  return (
    <form
      className="dl-author-form dl-author-panel"
      onSubmit={(event) => void submit(event)}
    >
      <h3>邀请作者账户</h3>
      <p>仅 platform-admin 可创建；首次 OIDC 登录需要此 token。</p>
      <label>
        <span>OIDC 邮箱</span>
        <input name="email" type="email" required />
      </label>
      <Button type="submit">创建账户邀请</Button>
      {invitation && !invitation.projectId && (
        <TokenResult invitation={invitation} />
      )}
    </form>
  );
}

function TokenResult({ invitation }: { invitation: InvitationWithToken }) {
  return (
    <div className="dl-author-token" role="status">
      <strong>只显示一次</strong>
      <code>{invitation.token}</code>
      <CopyButton label="复制 token" value={invitation.token} />
      <small>到期：{invitation.expiresAt}</small>
    </div>
  );
}
