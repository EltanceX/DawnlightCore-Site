"use client";

import Link from "next/link";
import type {
  ContractVersionToolEntry,
  GraphToolRecord,
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

type GraphView = Omit<GraphToolRecord, "nodes" | "edges"> & {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
};

export function GraphExplorer({
  initialGraph,
  versions,
  locale,
}: {
  initialGraph: GraphToolRecord;
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
  const { data, status } = useApiResource<GraphView>(
    `/api/v1/contracts/${encodeURIComponent(state.version)}/graph`,
    initialGraph,
    versionKnown,
  );
  const query = state.q.trim().toLocaleLowerCase();
  const nodes = data.nodes.filter((node) =>
    !query ? true : JSON.stringify(node).toLocaleLowerCase().includes(query),
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
          节点 <strong>{nodes.length}</strong> · 边{" "}
          <strong>{data.edges.length}</strong>
        </span>
        <DataSourceBadge status={status} />
      </div>
      {!versionKnown ? (
        <ToolEmptyState title="Contract 版本不可用">
          当前 fixture 不包含 {state.version}，不能跨版本猜测 Pipeline graph。
        </ToolEmptyState>
      ) : data.status === "unavailable" ? (
        <div className="dl-tool-boundary-state">
          <div>
            <StatusBadge status="Graph unavailable" />
            <h2>当前 contract 没有结构化 Graph dump</h2>
            <p>{data.reason}</p>
          </div>
          <SourceRefActions id={data.id} sourceRef={data.sourceRef} />
          <p>
            React Flow/ELK 画布只会在 contract 提供节点、边、资源生命周期和稳定
            sourceRef 后启用；空画布不会被伪装成成功结果。
          </p>
        </div>
      ) : nodes.length === 0 ? (
        <ToolEmptyState title="没有匹配的 Graph 节点">
          清除搜索词以恢复完整节点列表。列表模式始终作为图形画布的可访问降级。
        </ToolEmptyState>
      ) : (
        <section
          className="dl-tool-graph-list"
          aria-label="Pipeline Graph 列表降级"
        >
          <h2>节点列表</h2>
          <ol>
            {nodes.map((node, index) => (
              <li key={String(node.id ?? index)}>
                <code>{String(node.id ?? `node-${index + 1}`)}</code>
                <pre>{JSON.stringify(node, null, 2)}</pre>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="dl-v2-backlink">
        <Link href={`/${locale}/docs/preview/pipeline/overview/`}>
          阅读 Pipeline 概览
        </Link>
      </p>
    </>
  );
}
