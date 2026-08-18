"use client";

import Link from "next/link";
import { ArrowRight, Download, Search, ShieldCheck } from "lucide-react";
import type { DirectoryProject } from "@/lib/shader-directory";
import {
  CopyButton,
  DataSourceBadge,
  StatusBadge,
  ToolEmptyState,
  useApiResource,
  useToolUrlState,
} from "@/components/developer-tools/tool-shared";
import { directoryFilterOptions } from "@/lib/shader-directory";

const defaults = {
  q: "",
  core: "",
  gameApi: "all",
  platform: "all",
  architecture: "all",
  gpu: "all",
  channel: "all",
  license: "all",
  status: "all",
};

function queryString(state: typeof defaults) {
  return Object.entries(state)
    .filter(([, value]) => value && value !== "all")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

function filterProjects(projects: DirectoryProject[], state: typeof defaults) {
  const query = state.q.trim().toLocaleLowerCase();
  return projects.filter((project) => {
    const version = project.latestVersion;
    const compatibility = project.compatibilities[0];
    const searchable = [
      project.id,
      project.slug,
      project.name,
      project.summary,
      version?.version,
      version?.gameApiTag,
      version?.coreCommit,
      project.license?.spdxId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (state.core && !version?.coreCommit.startsWith(state.core)) return false;
    if (state.gameApi !== "all" && version?.gameApiTag !== state.gameApi)
      return false;
    if (state.channel !== "all" && version?.channel !== state.channel)
      return false;
    if (
      state.status !== "all" &&
      project.status !== state.status &&
      version?.status !== state.status
    )
      return false;
    if (
      state.license !== "all" &&
      (project.license?.status ?? "unknown") !== state.license
    )
      return false;
    if (
      state.platform !== "all" &&
      !compatibility?.platforms.includes(state.platform)
    )
      return false;
    if (
      state.architecture !== "all" &&
      !compatibility?.architectures.includes(state.architecture)
    )
      return false;
    if (state.gpu !== "all" && !compatibility?.gpuClasses.includes(state.gpu))
      return false;
    return true;
  });
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="dl-directory-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DirectoryExplorer({
  initialProjects,
  locale,
}: {
  initialProjects: DirectoryProject[];
  locale: string;
}) {
  const { state, update, reset } = useToolUrlState(defaults);
  const apiPath = `/api/v1/directory/projects?${queryString(state)}`;
  const { data, status } = useApiResource<DirectoryProject[]>(
    apiPath,
    initialProjects,
  );
  const projects = filterProjects(data, state);
  const gameApiOptions = [
    { value: "all", label: "全部 Game API" },
    ...Array.from(
      new Set(
        initialProjects
          .map((project) => project.latestVersion?.gameApiTag)
          .filter(Boolean),
      ),
    ).map((value) => ({ value: value as string, label: value as string })),
  ];
  const platformOptions = [
    { value: "all", label: "全部平台" },
    { value: "windows", label: "Windows" },
    { value: "linux", label: "Linux" },
    { value: "macos", label: "macOS" },
  ];
  const architectureOptions = [
    { value: "all", label: "全部架构" },
    { value: "x64", label: "x64" },
    { value: "arm64", label: "arm64" },
  ];
  const gpuOptions = [
    { value: "all", label: "全部 GPU" },
    { value: "integrated", label: "集成显卡" },
    { value: "discrete", label: "独立显卡" },
  ];

  return (
    <>
      <section aria-label="目录筛选" className="dl-directory-controls">
        <label className="dl-directory-field dl-directory-field--search">
          <span>搜索项目、版本或 Core commit</span>
          <span className="dl-directory-input-wrap">
            <Search size={15} aria-hidden="true" />
            <input
              autoComplete="off"
              onChange={(event) => update({ q: event.target.value })}
              placeholder="例如 Dawnlight、3.1 或 3ec28fc9"
              type="search"
              value={state.q}
            />
          </span>
        </label>
        <label className="dl-directory-field">
          <span>Core commit 前缀</span>
          <input
            autoComplete="off"
            onChange={(event) => update({ core: event.target.value })}
            placeholder="例如 3ec28fc9"
            value={state.core}
          />
        </label>
        <SelectField
          label="状态"
          options={directoryFilterOptions.status}
          value={state.status}
          onChange={(value) => update({ status: value })}
        />
        <SelectField
          label="频道"
          options={directoryFilterOptions.channel}
          value={state.channel}
          onChange={(value) => update({ channel: value })}
        />
        <SelectField
          label="许可证"
          options={directoryFilterOptions.license}
          value={state.license}
          onChange={(value) => update({ license: value })}
        />
        <SelectField
          label="Game API"
          options={gameApiOptions}
          value={state.gameApi}
          onChange={(value) => update({ gameApi: value })}
        />
        <SelectField
          label="平台"
          options={platformOptions}
          value={state.platform}
          onChange={(value) => update({ platform: value })}
        />
        <SelectField
          label="架构"
          options={architectureOptions}
          value={state.architecture}
          onChange={(value) => update({ architecture: value })}
        />
        <SelectField
          label="GPU 类别"
          options={gpuOptions}
          value={state.gpu}
          onChange={(value) => update({ gpu: value })}
        />
        <button
          className="dl-button dl-button--quiet"
          onClick={reset}
          type="button"
        >
          重置筛选
        </button>
      </section>
      <div className="dl-directory-summary" aria-live="polite">
        <span>
          找到 <strong>{projects.length}</strong> 个项目
        </span>
        <DataSourceBadge status={status} />
      </div>
      {projects.length === 0 ? (
        <ToolEmptyState title="没有匹配的项目">
          当前目录只展示维护者确认的公开 candidate。平台、架构或 GPU
          筛选没有对应兼容性记录时，不会把未验证项目自动视为兼容。
        </ToolEmptyState>
      ) : (
        <div className="dl-directory-grid">
          {projects.map((project) => {
            const version = project.latestVersion;
            const compatibility = project.compatibilities[0];
            const query = queryString(state);
            return (
              <article className="dl-directory-card" key={project.slug}>
                <div className="dl-directory-card__topline">
                  <StatusBadge status={project.status} />
                  <span>{version?.channel ?? "无版本"}</span>
                </div>
                <h2>{project.name}</h2>
                <p>{project.summary}</p>
                <div className="dl-directory-card__id">
                  <code>{project.id}</code>
                  <CopyButton label="项目 ID" value={project.id} />
                </div>
                <dl className="dl-directory-facts">
                  <div>
                    <dt>最新版本</dt>
                    <dd>{version?.version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>验证</dt>
                    <dd>{version?.verification ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Artifact</dt>
                    <dd>{version?.artifactIds.length ?? 0} 个</dd>
                  </div>
                  <div>
                    <dt>许可证</dt>
                    <dd>{project.license?.status ?? "unknown"}</dd>
                  </div>
                  <div>
                    <dt>Game API</dt>
                    <dd>{version?.gameApiTag ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>兼容性</dt>
                    <dd>{compatibility?.status ?? "unverified"}</dd>
                  </div>
                </dl>
                <div className="dl-directory-compatibility">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>{compatibility?.reason ?? "暂无兼容性记录。"}</span>
                </div>
                <div className="dl-directory-recommendation">
                  {project.recommendation.artifact ? (
                    <a href={project.recommendation.artifact.downloadUrl}>
                      <Download size={14} aria-hidden="true" /> 下载推荐
                      artifact
                    </a>
                  ) : (
                    <span>
                      <Download size={14} aria-hidden="true" /> 暂无可下载
                      artifact
                    </span>
                  )}
                  <small>
                    {project.recommendation.exclusions[0] ??
                      project.recommendation.reasons[0]}
                  </small>
                </div>
                <Link
                  className="dl-directory-card__link"
                  href={`/${locale}/shaders/${project.slug}/${query ? `?${query}` : ""}`}
                >
                  查看项目与版本 <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
