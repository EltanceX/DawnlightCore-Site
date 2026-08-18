"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  OperationsOverview,
  OperationsReport,
  SessionPrincipal,
} from "@dawnlight/api-client";
import { AlertTriangle, RefreshCcw, ShieldCheck } from "lucide-react";
import {
  StatusBadge,
  ToolEmptyState,
} from "@/components/developer-tools/tool-shared";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

type State =
  "unconfigured" | "loading" | "signed-out" | "forbidden" | "ready" | "error";

export function OperationsConsole() {
  const [state, setState] = useState<State>(
    siteConfig.apiOrigin ? "loading" : "unconfigured",
  );
  const [session, setSession] = useState<SessionPrincipal | null>(null);
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [reports, setReports] = useState<OperationsReport[]>([]);
  const [message, setMessage] = useState("");

  const request = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const response = await fetch(`${siteConfig.apiOrigin}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: { code?: string; message?: string };
    };
    if (!response.ok)
      throw new Error(
        `${body.error?.code ?? response.status}：${body.error?.message ?? "请求失败"}`,
      );
    return body.data as T;
  }, []);

  const load = useCallback(async () => {
    if (!siteConfig.apiOrigin) return;
    setState("loading");
    setMessage("");
    try {
      const current = await request<SessionPrincipal>("/api/v1/auth/session");
      setSession(current);
      if (!current.user.isPlatformAdmin) {
        setState("forbidden");
        return;
      }
      const [nextOverview, nextReports] = await Promise.all([
        request<OperationsOverview>("/api/v1/ops/overview?days=7"),
        request<OperationsReport[]>("/api/v1/ops/reports"),
      ]);
      setOverview(nextOverview);
      setReports(nextReports);
      setState("ready");
    } catch (error) {
      const text = error instanceof Error ? error.message : "运营 API 不可用";
      setMessage(text);
      setState(
        text.startsWith("AuthenticationRequired") || text.startsWith("401")
          ? "signed-out"
          : "error",
      );
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mutate = async <T,>(path: string, body: unknown) => {
    if (!session) throw new Error("运营会话尚未建立");
    return request<T>(path, {
      method: "POST",
      headers: {
        "x-csrf-token": session.csrfToken,
        "idempotency-key": `ops-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(body),
    });
  };

  const run = async (action: () => Promise<void>) => {
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    }
  };

  if (state === "unconfigured") {
    return (
      <ToolEmptyState title="运营 API 尚未配置">
        静态 Preview 不加载运营 fixture。配置公开 API origin
        后，平台管理员才能读取私有聚合数据。
      </ToolEmptyState>
    );
  }
  if (state === "loading")
    return (
      <ToolEmptyState title="正在读取运营状态">
        只读取聚合指标、审核队列和举报记录，不下载原始包正文。
      </ToolEmptyState>
    );
  if (state === "signed-out")
    return (
      <ToolEmptyState title="需要登录">
        <Link href="/zh-CN/author/">前往作者工作区完成 OIDC 登录</Link>。
      </ToolEmptyState>
    );
  if (state === "forbidden")
    return (
      <ToolEmptyState title="需要平台管理员权限">
        项目 owner、maintainer 和 reviewer 不能访问全局运营数据。
      </ToolEmptyState>
    );
  if (state === "error" || !overview)
    return (
      <ToolEmptyState title="运营 API 暂时不可用">
        {message} <button onClick={() => void load()}>重新连接</button>
      </ToolEmptyState>
    );

  return (
    <div className="dl-ops-console">
      <header className="dl-author-session">
        <div>
          <span>Operations</span>
          <strong>{session?.user.displayName}</strong>
          <small>聚合数据 · private, no-store</small>
        </div>
        <div>
          <Link
            className="dl-button dl-button--quiet"
            href="/zh-CN/author/#reviewer-queue"
          >
            审核队列
          </Link>
          <Button onClick={() => void load()} type="button" variant="quiet">
            <RefreshCcw size={15} aria-hidden="true" /> 刷新
          </Button>
        </div>
      </header>
      {message && (
        <p className="dl-author-message" role="alert">
          {message}
        </p>
      )}
      <section className="dl-ops-metrics" aria-label="运营指标">
        <Metric label="成功下载" value={overview.downloads.success} />
        <Metric
          label="下载错误"
          value={overview.downloads.errors}
          alert={overview.downloads.errors > 0}
        />
        <Metric
          label="待审核"
          value={overview.reviewQueue}
          alert={overview.reviewQueue > 0}
        />
        <Metric
          label="验证失败率"
          value={formatPercent(overview.validationFailureRate)}
          alert={(overview.validationFailureRate ?? 0) > 0.1}
        />
        <Metric label="公开对象" value={overview.storage.publishedObjects} />
      </section>
      <div className="dl-ops-grid">
        <OpsList title="队列积压" values={overview.queues} />
        <OpsList title="Loader 结果" values={overview.loader} />
        <section className="dl-author-section">
          <div className="dl-author-section__heading">
            <div>
              <span>Storage</span>
              <h2>存储投影</h2>
            </div>
            <StatusBadge status="metadata-only" />
          </div>
          <p>
            Published：{formatBytes(overview.storage.publishedBytes)} /{" "}
            {overview.storage.publishedObjects} 对象
          </p>
          <p>
            Quarantine 声明：
            {formatBytes(overview.storage.quarantineExpectedBytes)} /{" "}
            {overview.storage.quarantineObjects} 对象
          </p>
          <small>对象存储总容量未由 S3 API 提供，因此不推断剩余容量。</small>
        </section>
      </div>
      <section className="dl-author-section">
        <div className="dl-author-section__heading">
          <div>
            <span>Downloads</span>
            <h2>热门 artifact 与错误</h2>
          </div>
          <StatusBadge status="7 days" />
        </div>
        <div className="dl-ops-table-wrap">
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th>文件</th>
                <th>下载</th>
              </tr>
            </thead>
            <tbody>
              {overview.topArtifacts.map((item) => (
                <tr key={item.artifactId}>
                  <td>{item.projectSlug ?? "unknown"}</td>
                  <td>
                    <code>{item.fileName}</code>
                  </td>
                  <td>{item.count}</td>
                </tr>
              ))}
              {overview.topArtifacts.length === 0 && (
                <tr>
                  <td colSpan={3}>尚无下载事件。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {overview.downloadErrors.length > 0 && (
          <p className="dl-ops-alert">
            <AlertTriangle size={16} aria-hidden="true" />{" "}
            {overview.downloadErrors
              .map((item) => `${item.code}: ${item.count}`)
              .join(" · ")}
          </p>
        )}
      </section>
      <ReportsPanel
        reports={reports}
        onResolve={(report, status, reason) =>
          run(async () => {
            const updated = await mutate<OperationsReport>(
              `/api/v1/ops/reports/${report.id}/resolve`,
              { status, reason },
            );
            setReports((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
          })
        }
      />
      <ModerationPanel
        onSubmit={(kind, id, action, reason) =>
          run(async () => {
            if (!window.confirm(`确认执行 ${action}？此操作会写入审计记录。`))
              return;
            if (kind === "version")
              await mutate(`/api/v1/ops/versions/${id}/withdraw`, { reason });
            else
              await mutate(`/api/v1/ops/projects/${id}/moderate`, {
                action,
                reason,
              });
            await load();
          })
        }
      />
      <p className="dl-ops-privacy">
        <ShieldCheck size={16} aria-hidden="true" /> 下载事件不保存长期
        IP、用户账户或包正文；原始事件按配置保留期自动清理。
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
}) {
  return (
    <article
      className={alert ? "dl-ops-metric dl-ops-metric--alert" : "dl-ops-metric"}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function OpsList({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  return (
    <section className="dl-author-section">
      <div className="dl-author-section__heading">
        <div>
          <span>Aggregate</span>
          <h2>{title}</h2>
        </div>
      </div>
      <dl className="dl-ops-list">
        {Object.entries(values).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {Object.keys(values).length === 0 && (
          <div>
            <dt>无数据</dt>
            <dd>0</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function ReportsPanel({
  reports,
  onResolve,
}: {
  reports: OperationsReport[];
  onResolve: (
    report: OperationsReport,
    status: "in-review" | "resolved" | "rejected",
    reason: string,
  ) => Promise<void>;
}) {
  return (
    <section className="dl-author-section">
      <div className="dl-author-section__heading">
        <div>
          <span>Reports</span>
          <h2>举报与版权请求</h2>
        </div>
        <StatusBadge status={`${reports.length} reports`} />
      </div>
      {reports.map((report) => (
        <form
          className="dl-ops-report"
          key={report.id}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onResolve(
              report,
              data.get("status") as "in-review" | "resolved" | "rejected",
              String(data.get("reason") ?? ""),
            );
          }}
        >
          <div>
            <strong>{report.resourceId ?? "未指定资源"}</strong>
            <small>
              {report.status} ·{" "}
              {new Date(report.createdAt).toLocaleString("zh-CN")}
            </small>
            <p>{report.reason}</p>
          </div>
          <select name="status" defaultValue="in-review">
            <option value="in-review">处理中</option>
            <option value="resolved">已解决</option>
            <option value="rejected">驳回</option>
          </select>
          <input
            name="reason"
            minLength={3}
            placeholder="运营处理说明"
            required
          />
          <button className="dl-button dl-button--secondary" type="submit">
            记录决定
          </button>
        </form>
      ))}
      {reports.length === 0 && <p>当前没有举报。</p>}
    </section>
  );
}

function ModerationPanel({
  onSubmit,
}: {
  onSubmit: (
    kind: "project" | "version",
    id: string,
    action: string,
    reason: string,
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<"project" | "version">("version");
  return (
    <section className="dl-author-section">
      <div className="dl-author-section__heading">
        <div>
          <span>Moderation</span>
          <h2>撤回与项目可见性</h2>
        </div>
      </div>
      <form
        className="dl-ops-moderation"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onSubmit(
            kind,
            String(data.get("id") ?? ""),
            kind === "version"
              ? "withdraw"
              : String(data.get("action") ?? "hide"),
            String(data.get("reason") ?? ""),
          );
        }}
      >
        <select
          name="kind"
          value={kind}
          onChange={(event) =>
            setKind(event.currentTarget.value as "project" | "version")
          }
        >
          <option value="version">撤回版本</option>
          <option value="project">项目操作</option>
        </select>
        <input name="id" placeholder="UUID" required />
        {kind === "project" ? (
          <select name="action" defaultValue="hide">
            <option value="hide">hide</option>
            <option value="unhide">unhide</option>
            <option value="ban">ban</option>
            <option value="unban">unban</option>
          </select>
        ) : (
          <input aria-label="操作" disabled value="withdraw" />
        )}
        <input
          name="reason"
          minLength={3}
          placeholder="必须填写原因"
          required
        />
        <button className="dl-button dl-button--danger" type="submit">
          执行操作
        </button>
      </form>
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

function formatPercent(value: number | null) {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}
