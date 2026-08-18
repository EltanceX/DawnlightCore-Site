"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import type {
  ContractVersionToolEntry,
  DiagnosticToolEntry,
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

const groupOptions = [
  { value: "all", label: "全部分类" },
  { value: "catalog", label: "Catalog" },
  { value: "manifest", label: "Manifest" },
] as const;
const descriptions = {
  catalog:
    "检查 StageTemplate、Service、SemanticProvider 和 EngineDrawProvider 引用。",
  manifest: "检查可选服务和 Manifest 声明与当前 Catalog 的关系。",
} as const;

export function DiagnosticExplorer({
  initialEntries,
  versions,
  locale,
}: {
  initialEntries: DiagnosticToolEntry[];
  versions: readonly ContractVersionToolEntry[];
  locale: string;
}) {
  const defaultVersion = versions[0].version;
  const { state, update, reset } = useToolUrlState({
    version: defaultVersion,
    q: "",
    group: "all",
  });
  const versionKnown = versions.some(
    (entry) => entry.version === state.version,
  );
  const { data, status } = useApiResource<DiagnosticToolEntry[]>(
    `/api/v1/contracts/${encodeURIComponent(state.version)}/diagnostics`,
    initialEntries,
    versionKnown,
  );
  const query = state.q.trim().toLocaleLowerCase();
  const entries = versionKnown
    ? data.filter((entry) => {
        const matchesGroup =
          state.group === "all" || entry.group === state.group;
        const searchable = [
          entry.id,
          entry.code,
          entry.group,
          entry.sourceRef.path,
          entry.sourceRef.pointer,
          descriptions[entry.group as keyof typeof descriptions],
        ]
          .join(" ")
          .toLocaleLowerCase();
        return matchesGroup && (!query || searchable.includes(query));
      })
    : [];

  return (
    <>
      <ToolControls
        filter={state.group}
        filterLabel="诊断分类"
        filterOptions={groupOptions}
        onFilter={(group) => update({ group })}
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
          当前 fixture 不包含 {state.version}
          。请选择已列出的版本，或检查共享链接中的 version 参数。
        </ToolEmptyState>
      ) : entries.length === 0 ? (
        <ToolEmptyState title="没有匹配的诊断">
          尝试清除搜索词或切换诊断分类。搜索不会扩展到未进入 contract
          的内部错误。
        </ToolEmptyState>
      ) : (
        <div className="dl-v2-list dl-tool-list">
          {entries.map((entry) => (
            <article className="dl-tool-record" key={entry.code}>
              <span className="dl-v2-list-item__icon">
                <CircleAlert size={18} aria-hidden="true" />
              </span>
              <div className="dl-tool-record__body">
                <div className="dl-tool-record__heading">
                  <code>{entry.code}</code>
                  <StatusBadge status={entry.status} />
                  <StatusBadge
                    status={entry.group === "catalog" ? "Catalog" : "Manifest"}
                  />
                </div>
                <p>{descriptions[entry.group as keyof typeof descriptions]}</p>
                <SourceRefActions
                  id={entry.code}
                  idLabel="诊断码"
                  sourceRef={entry.sourceRef}
                />
              </div>
              <Link
                aria-label={`查看 ${entry.code}`}
                className="dl-tool-detail-link"
                href={`/${locale}/tools/diagnostics/${entry.code}/?version=${encodeURIComponent(state.version)}`}
              >
                查看解释 <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
