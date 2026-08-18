"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Clipboard, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export type ToolDataStatus = "fixture" | "loading" | "api" | "fallback";
export type ToolSourceRef = { path: string; pointer: string; commit: string };

export function useToolUrlState<T extends Record<string, string>>(defaults: T) {
  const defaultsRef = useRef(defaults);
  const [state, setState] = useState(defaults);

  const readUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaultsRef.current };
    for (const key of Object.keys(next) as (keyof T)[]) {
      const value = params.get(String(key));
      if (value) next[key] = value as T[keyof T];
    }
    setState(next);
  }, []);

  useEffect(() => {
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [readUrl]);

  const update = useCallback((patch: Partial<T>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      const url = new URL(window.location.href);
      for (const key of Object.keys(next) as (keyof T)[]) {
        const value = next[key];
        if (!value || value === defaultsRef.current[key]) {
          url.searchParams.delete(String(key));
        } else {
          url.searchParams.set(String(key), value);
        }
      }
      window.history.replaceState({}, "", url);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const url = new URL(window.location.href);
    for (const key of Object.keys(defaultsRef.current)) {
      url.searchParams.delete(key);
    }
    window.history.replaceState({}, "", url);
    setState(defaultsRef.current);
  }, []);

  return { state, update, reset };
}

export function useApiResource<T>(
  path: string,
  fixture: T,
  enabled = true,
): { data: T; status: ToolDataStatus } {
  const [result, setResult] = useState<{
    data: T;
    status: ToolDataStatus;
    path: string;
  }>({ data: fixture, status: "loading", path });

  useEffect(() => {
    if (!siteConfig.apiOrigin || !enabled) return;
    const controller = new AbortController();
    fetch(`${siteConfig.apiOrigin}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const body = (await response.json()) as { data: T };
        setResult({ data: body.data, status: "api", path });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setResult({ data: fixture, status: "fallback", path });
      });
    return () => controller.abort();
  }, [enabled, fixture, path]);

  if (!siteConfig.apiOrigin || !enabled) {
    return { data: fixture, status: "fixture" };
  }
  if (result.path !== path) {
    return { data: fixture, status: "loading" };
  }
  return result;
}

export function DataSourceBadge({ status }: { status: ToolDataStatus }) {
  const labels: Record<ToolDataStatus, string> = {
    fixture: "构建期 fixture",
    loading: "正在连接 API",
    api: "实时只读 API",
    fallback: "API 不可用 · fixture",
  };
  return (
    <span className="dl-tool-source" data-source={status} role="status">
      <span aria-hidden="true" />
      {labels[status]}
    </span>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      aria-label={`复制${label}`}
      className="dl-tool-copy"
      onClick={copy}
      type="button"
    >
      {copied ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Clipboard size={14} aria-hidden="true" />
      )}
      {copied ? "已复制" : label}
    </button>
  );
}

export function ToolControls({
  query,
  onQuery,
  version,
  versions,
  onVersion,
  filterLabel,
  filter,
  filterOptions,
  onFilter,
  onReset,
}: {
  query: string;
  onQuery: (value: string) => void;
  version: string;
  versions: readonly { version: string; status: string }[];
  onVersion: (value: string) => void;
  filterLabel?: string;
  filter?: string;
  filterOptions?: readonly { value: string; label: string }[];
  onFilter?: (value: string) => void;
  onReset: () => void;
}) {
  const versionKnown = versions.some((entry) => entry.version === version);
  return (
    <section aria-label="工具筛选" className="dl-tool-controls">
      <label className="dl-tool-field dl-tool-field--search">
        <span>搜索</span>
        <span className="dl-tool-input-wrap">
          <Search size={15} aria-hidden="true" />
          <input
            autoComplete="off"
            onChange={(event) => onQuery(event.target.value)}
            placeholder="输入稳定 ID、诊断码或路径"
            type="search"
            value={query}
          />
        </span>
      </label>
      <label className="dl-tool-field">
        <span>Contract 版本</span>
        <select
          onChange={(event) => onVersion(event.target.value)}
          value={version}
        >
          {!versionKnown && (
            <option value={version}>{version}（不可用）</option>
          )}
          {versions.map((entry) => (
            <option key={entry.version} value={entry.version}>
              {entry.version} · {entry.status}
            </option>
          ))}
        </select>
      </label>
      {filterLabel && filterOptions && onFilter && (
        <label className="dl-tool-field">
          <span>{filterLabel}</span>
          <select
            onChange={(event) => onFilter(event.target.value)}
            value={filter}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button onClick={onReset} type="button" variant="quiet">
        <RotateCcw size={15} aria-hidden="true" /> 重置
      </Button>
    </section>
  );
}

export function SourceRefActions({
  id,
  sourceRef,
  idLabel = "稳定 ID",
}: {
  id: string;
  sourceRef: ToolSourceRef;
  idLabel?: string;
}) {
  return (
    <div className="dl-tool-source-ref">
      <code title={sourceRef.commit}>
        {sourceRef.path}
        {sourceRef.pointer || "/"}
      </code>
      <span>
        <CopyButton label={idLabel} value={id} />
        <CopyButton label="JSON path" value={sourceRef.pointer || "/"} />
      </span>
    </div>
  );
}

export function ToolEmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="dl-tool-empty" role="status">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function ResultSummary({
  count,
  status,
}: {
  count: number;
  status: ToolDataStatus;
}) {
  return (
    <div className="dl-tool-result-summary" aria-live="polite">
      <span>
        找到 <strong>{count}</strong> 项
      </span>
      <DataSourceBadge status={status} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge>{status}</Badge>;
}
