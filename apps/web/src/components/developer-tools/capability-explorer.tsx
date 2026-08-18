"use client";

import Link from "next/link";
import type {
  CapabilityToolEntry,
  ContractVersionToolEntry,
} from "@/lib/developer-tools";
import {
  ResultSummary,
  SourceRefActions,
  StatusBadge,
  ToolControls,
  ToolEmptyState,
  useApiResource,
  useToolUrlState,
} from "./tool-shared";

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "preview", label: "Preview" },
  { value: "deprecated", label: "Deprecated" },
] as const;

export function CapabilityExplorer({
  initialEntries,
  versions,
  locale,
}: {
  initialEntries: CapabilityToolEntry[];
  versions: readonly ContractVersionToolEntry[];
  locale: string;
}) {
  const defaultVersion = versions[0].version;
  const { state, update, reset } = useToolUrlState({
    version: defaultVersion,
    q: "",
    status: "all",
  });
  const versionKnown = versions.some(
    (entry) => entry.version === state.version,
  );
  const { data, status } = useApiResource<CapabilityToolEntry[]>(
    `/api/v1/contracts/${encodeURIComponent(state.version)}/capabilities`,
    initialEntries,
    versionKnown,
  );
  const query = state.q.trim().toLocaleLowerCase();
  const entries = versionKnown
    ? data.filter((entry) => {
        const matchesStatus =
          state.status === "all" || entry.status === state.status;
        const searchable = [
          entry.id,
          entry.status,
          entry.sourceRef.path,
          entry.sourceRef.pointer,
        ]
          .join(" ")
          .toLocaleLowerCase();
        return matchesStatus && (!query || searchable.includes(query));
      })
    : [];

  return (
    <>
      <ToolControls
        filter={state.status}
        filterLabel="Contract 状态"
        filterOptions={statusOptions}
        onFilter={(value) => update({ status: value })}
        onQuery={(q) => update({ q })}
        onReset={reset}
        onVersion={(version) => update({ version })}
        query={state.q}
        version={state.version}
        versions={versions}
      />
      <ResultSummary count={entries.length} status={status} />
      {!versionKnown ? (
        <ToolEmptyState title="Contract 版本不可用">
          当前 fixture 不包含 {state.version}，无法提供 capability 记录。
        </ToolEmptyState>
      ) : entries.length === 0 ? (
        <ToolEmptyState title="没有匹配的 Capability">
          当前快照只包含有来源的 capability ID；设备数值上限仍需 Loader 验证。
        </ToolEmptyState>
      ) : (
        <div className="dl-tool-capability-list">
          {entries.map((entry) => (
            <article className="dl-tool-capability" key={entry.id}>
              <div className="dl-tool-record__heading">
                <code>{entry.id}</code>
                <StatusBadge status={entry.status} />
              </div>
              <p>
                当前 contract 只锁定能力
                ID；数值上限、设备差异和运行时降级由同一 Core commit 的 Loader
                结果决定。
              </p>
              <SourceRefActions id={entry.id} sourceRef={entry.sourceRef} />
            </article>
          ))}
        </div>
      )}
      <p className="dl-v2-backlink">
        <Link
          href={`/${locale}/docs/preview/00-overview/capabilities-and-limitations/`}
        >
          阅读能力与限制说明
        </Link>
      </p>
    </>
  );
}
