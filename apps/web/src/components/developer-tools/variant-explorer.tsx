"use client";

import Link from "next/link";
import type {
  ContractVersionToolEntry,
  VariantToolRecord,
} from "@/lib/developer-tools";
import {
  DataSourceBadge,
  SourceRefActions,
  StatusBadge,
  ToolControls,
  ToolEmptyState,
  useApiResource,
  useToolUrlState,
} from "./tool-shared";

type VariantView = Omit<VariantToolRecord, "explanations"> & {
  explanations: Record<string, unknown>[];
};

export function VariantExplorer({
  initialVariant,
  versions,
  locale,
}: {
  initialVariant: VariantToolRecord;
  versions: readonly ContractVersionToolEntry[];
  locale: string;
}) {
  const defaultVersion = versions[0].version;
  const { state, update, reset } = useToolUrlState({
    version: defaultVersion,
    q: "",
  });
  const versionKnown = versions.some(
    (entry) => entry.version === state.version,
  );
  const { data, status } = useApiResource<VariantView>(
    `/api/v1/contracts/${encodeURIComponent(state.version)}/variant`,
    initialVariant,
    versionKnown,
  );
  const query = state.q.trim().toLocaleLowerCase();
  const explanations = data.explanations.filter((entry) =>
    !query ? true : JSON.stringify(entry).toLocaleLowerCase().includes(query),
  );

  return (
    <>
      <ToolControls
        onQuery={(q) => update({ q })}
        onReset={reset}
        onVersion={(version) => update({ version })}
        query={state.q}
        version={state.version}
        versions={versions}
      />
      <div className="dl-tool-result-summary" aria-live="polite">
        <span>
          Explain 记录 <strong>{explanations.length}</strong>
        </span>
        <DataSourceBadge status={status} />
      </div>
      {!versionKnown ? (
        <ToolEmptyState title="Contract 版本不可用">
          当前 fixture 不包含 {state.version}，网页不会借用其他版本的 define
          结果。
        </ToolEmptyState>
      ) : data.status === "unavailable" ? (
        <div className="dl-tool-boundary-state">
          <div>
            <StatusBadge status="Variant explain unavailable" />
            <h2>当前没有稳定的 CLI JSON 输出</h2>
            <p>{data.reason}</p>
          </div>
          <SourceRefActions id={data.id} sourceRef={data.sourceRef} />
          <p>
            网页不会枚举 defines、执行条件表达式或推断最终 shader
            variant。只有绑定输入 hash、Core commit 和 CLI 版本的 explain
            记录才能进入列表。
          </p>
        </div>
      ) : explanations.length === 0 ? (
        <ToolEmptyState title="没有匹配的 Variant explain">
          清除搜索词，或确认 Loader 输出是否包含当前 option/define 组合。
        </ToolEmptyState>
      ) : (
        <div className="dl-tool-explain-list">
          {explanations.map((entry, index) => (
            <pre key={String(entry.id ?? index)}>
              {JSON.stringify(entry, null, 2)}
            </pre>
          ))}
        </div>
      )}
      <p className="dl-v2-backlink">
        <Link
          href={`/${locale}/docs/preview/03-manifest/defines-and-variants/`}
        >
          阅读 Defines 与 Variants
        </Link>
      </p>
    </>
  );
}
