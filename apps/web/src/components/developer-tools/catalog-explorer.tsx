"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";
import type {
  CatalogToolEntry,
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

const kindOptions = [
  { value: "all", label: "全部类型" },
  { value: "stage-template", label: "Stage Templates" },
  { value: "service", label: "Services" },
  { value: "semantic-provider", label: "Semantic Providers" },
  { value: "engine-draw-provider", label: "EngineDraw Providers" },
] as const;
const kindLabels = Object.fromEntries(
  kindOptions
    .filter((entry) => entry.value !== "all")
    .map((entry) => [entry.value, entry.label]),
) as Record<string, string>;

export function CatalogExplorer({
  initialEntries,
  versions,
  locale,
}: {
  initialEntries: CatalogToolEntry[];
  versions: readonly ContractVersionToolEntry[];
  locale: string;
}) {
  const defaultVersion = versions[0].version;
  const { state, update, reset } = useToolUrlState({
    version: defaultVersion,
    q: "",
    kind: "all",
  });
  const versionKnown = versions.some(
    (entry) => entry.version === state.version,
  );
  const { data, status } = useApiResource<CatalogToolEntry[]>(
    `/api/v1/contracts/${encodeURIComponent(state.version)}/catalog`,
    initialEntries,
    versionKnown,
  );
  const query = state.q.trim().toLocaleLowerCase();
  const entries = versionKnown
    ? data.filter((entry) => {
        const matchesKind = state.kind === "all" || entry.kind === state.kind;
        const searchable = [
          entry.id,
          entry.kind,
          entry.sourceRef.path,
          entry.sourceRef.pointer,
        ]
          .join(" ")
          .toLocaleLowerCase();
        return matchesKind && (!query || searchable.includes(query));
      })
    : [];
  const groups = kindOptions
    .filter((option) => option.value !== "all")
    .map((option) => ({
      ...option,
      entries: entries.filter((entry) => entry.kind === option.value),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <>
      <ToolControls
        filter={state.kind}
        filterLabel="Catalog 类型"
        filterOptions={kindOptions}
        onFilter={(kind) => update({ kind })}
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
          当前 fixture 不包含 {state.version}。网页不会把其他版本的同名 ID
          自动代入。
        </ToolEmptyState>
      ) : entries.length === 0 ? (
        <ToolEmptyState title="没有匹配的 Catalog ID">
          尝试清除搜索词或切换类型。未进入版本化 contract 的 C#
          类型不会出现在这里。
        </ToolEmptyState>
      ) : (
        <div className="dl-v2-catalog-grid dl-tool-catalog-grid">
          {groups.map((group) => (
            <section className="dl-v2-catalog-section" key={group.value}>
              <div className="dl-v2-section-heading">
                <div className="dl-v2-card__icon">
                  <Boxes size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2>{group.label}</h2>
                  <StatusBadge status={`${group.entries.length} IDs`} />
                </div>
              </div>
              <div className="dl-tool-record-stack">
                {group.entries.map((entry) => (
                  <article
                    className="dl-tool-compact-record"
                    key={`${entry.kind}:${entry.id}`}
                  >
                    <div className="dl-tool-record__heading">
                      <code>{entry.id}</code>
                      <StatusBadge status={entry.status} />
                    </div>
                    <SourceRefActions
                      id={entry.id}
                      sourceRef={entry.sourceRef}
                    />
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="dl-v2-backlink">
        <Link
          href={`/${locale}/docs/preview/02-concepts/trusted-catalog-boundary/`}
        >
          阅读 Trusted Catalog 边界
        </Link>
      </p>
      <span className="sr-only">
        {kindLabels[state.kind] ?? "全部 Catalog 类型"}
      </span>
    </>
  );
}
