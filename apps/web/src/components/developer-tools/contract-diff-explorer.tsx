"use client";

import { GitCompare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContractVersionToolEntry } from "@/lib/developer-tools";
import {
  DataSourceBadge,
  ToolEmptyState,
  useApiResource,
  useToolUrlState,
} from "./tool-shared";

type DiffItem = {
  entity:
    "schema" | "diagnostic" | "catalog" | "capability" | "graph" | "variant";
  id: string;
  kind?: string;
};
type DiffView = {
  from: string;
  to: string;
  added: DiffItem[];
  removed: DiffItem[];
  changed: DiffItem[];
};

export function ContractDiffExplorer({
  versions,
  initialDiff,
}: {
  versions: readonly ContractVersionToolEntry[];
  initialDiff: DiffView;
}) {
  const defaultVersion = versions[0].version;
  const { state, update, reset } = useToolUrlState({
    from: defaultVersion,
    to: defaultVersion,
  });
  const versionsKnown = [state.from, state.to].every((version) =>
    versions.some((entry) => entry.version === version),
  );
  const { data, status } = useApiResource<DiffView>(
    `/api/v1/contracts/diff?from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`,
    initialDiff,
    versionsKnown,
  );
  const total = data.added.length + data.removed.length + data.changed.length;

  return (
    <>
      <section
        aria-label="Contract Diff 版本"
        className="dl-tool-controls dl-tool-diff-controls"
      >
        <label className="dl-tool-field">
          <span>From</span>
          <select
            onChange={(event) => update({ from: event.target.value })}
            value={state.from}
          >
            {!versions.some((entry) => entry.version === state.from) && (
              <option value={state.from}>{state.from}（不可用）</option>
            )}
            {versions.map((entry) => (
              <option key={entry.version} value={entry.version}>
                {entry.version}
              </option>
            ))}
          </select>
        </label>
        <span className="dl-tool-diff-arrow" aria-hidden="true">
          <GitCompare size={18} />
        </span>
        <label className="dl-tool-field">
          <span>To</span>
          <select
            onChange={(event) => update({ to: event.target.value })}
            value={state.to}
          >
            {!versions.some((entry) => entry.version === state.to) && (
              <option value={state.to}>{state.to}（不可用）</option>
            )}
            {versions.map((entry) => (
              <option key={entry.version} value={entry.version}>
                {entry.version}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={reset} type="button" variant="quiet">
          <RotateCcw size={15} aria-hidden="true" /> 重置
        </Button>
      </section>
      <div className="dl-tool-result-summary" aria-live="polite">
        <span>
          变更 <strong>{versionsKnown ? total : 0}</strong>
        </span>
        <DataSourceBadge status={status} />
      </div>
      {!versionsKnown ? (
        <ToolEmptyState title="无法比较未知版本">
          From 或 To 不在当前 fixture
          中。网页不会用最近版本自动替换共享链接参数。
        </ToolEmptyState>
      ) : total === 0 ? (
        <ToolEmptyState title="两个 contract 没有结构差异">
          当前只有一个 Preview
          snapshot，因此同版本比较结果为空。新增版本后，这里会列出新增、
          移除和变更的稳定 ID。
        </ToolEmptyState>
      ) : (
        <div className="dl-tool-diff-grid">
          {(
            [
              ["新增", data.added],
              ["移除", data.removed],
              ["变更", data.changed],
            ] as const
          ).map(([label, items]) => (
            <section key={label}>
              <h2>{label}</h2>
              <ul>
                {items.map((item) => (
                  <li key={`${item.entity}:${item.kind ?? ""}:${item.id}`}>
                    <span>{item.entity}</span>
                    <code>{item.id}</code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
