"use client";

import { Copy, Download, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatBytes,
  formatDate,
  recommendArtifact,
  type Architecture,
  type Channel,
  type Platform,
  type ReleaseFeed,
} from "@/lib/releases";

type DownloadExperienceProps = {
  feed: ReleaseFeed;
};

const platforms: Platform[] = ["windows", "android", "linux", "ios", "web"];
const architectures: Architecture[] = ["x64", "arm64", "universal", "wasm"];

function suggestedPlatform(): Platform | undefined {
  if (typeof navigator === "undefined") return undefined;
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("windows")) return "windows";
  if (agent.includes("android")) return "android";
  if (agent.includes("iphone") || agent.includes("ipad")) return "ios";
  if (agent.includes("linux")) return "linux";
  return undefined;
}

export function DownloadExperience({ feed }: DownloadExperienceProps) {
  const channels = useMemo(
    () => [...new Set(feed.releases.map((release) => release.channel))],
    [feed.releases],
  );
  const [channel, setChannel] = useState<Channel | undefined>(channels[0]);
  const [platform, setPlatform] = useState<Platform | undefined>();
  const [architecture, setArchitecture] = useState<Architecture | undefined>();
  const [copied, setCopied] = useState(false);
  const [queryWarning, setQueryWarning] = useState<string>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = window.localStorage.getItem("dawnlight.download.platform");
    const nextPlatform = (params.get("platform") ?? saved) as Platform | null;
    const nextArchitecture = params.get("architecture") as Architecture | null;
    const nextChannel = params.get("channel") as Channel | null;
    window.queueMicrotask(() => {
      const invalid: string[] = [];
      if (nextPlatform && platforms.includes(nextPlatform))
        setPlatform(nextPlatform);
      else {
        if (params.has("platform")) invalid.push("platform");
        setPlatform(suggestedPlatform());
      }
      if (nextArchitecture && architectures.includes(nextArchitecture)) {
        setArchitecture(nextArchitecture);
      } else if (params.has("architecture")) {
        invalid.push("architecture");
      }
      if (nextChannel && channels.includes(nextChannel))
        setChannel(nextChannel);
      else if (params.has("channel")) invalid.push("channel");
      if (invalid.length > 0)
        setQueryWarning(
          `已忽略无效的 ${invalid.join("、")} 参数，请重新选择。`,
        );
    });
  }, [channels]);

  useEffect(() => {
    if (platform)
      window.localStorage.setItem("dawnlight.download.platform", platform);
  }, [platform]);

  const recommendation = recommendArtifact(feed, {
    channel,
    platform,
    architecture,
  });

  async function copyHash(hash: string) {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (feed.releases.length === 0) {
    return (
      <section className="dl-download-status" aria-live="polite">
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <h2>Preview feed 尚无可下载 artifact</h2>
          <p>
            Release Feed v1 已接入，但官方文件、SHA-256 和镜像 URL
            尚未冻结。页面不会展示未经核对的下载链接。
          </p>
          <Link href="/zh-CN/docs/preview/01-getting-started/prerequisites/">
            查看版本与验证前置条件
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="dl-download-experience">
      {queryWarning ? (
        <p className="dl-download-query-warning" role="status">
          {queryWarning}
        </p>
      ) : null}
      <div className="dl-download-controls" aria-label="下载筛选">
        <fieldset>
          <legend>发布渠道</legend>
          <div className="dl-segmented-control">
            {channels.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={channel === value}
                onClick={() => setChannel(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          平台
          <select
            value={platform ?? ""}
            onChange={(event) =>
              setPlatform((event.target.value || undefined) as Platform)
            }
          >
            <option value="">选择平台</option>
            {platforms.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          架构
          <select
            value={architecture ?? ""}
            onChange={(event) =>
              setArchitecture((event.target.value || undefined) as Architecture)
            }
          >
            <option value="">选择架构</option>
            {architectures.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="dl-artifact-panel" aria-live="polite">
        <p className="dl-eyebrow">推荐下载</p>
        <h2>{recommendation.release?.version ?? "没有匹配版本"}</h2>
        <p>{recommendation.reason}</p>
        {recommendation.artifact ? (
          <>
            <dl className="dl-artifact-facts">
              <div>
                <dt>文件</dt>
                <dd>{recommendation.artifact.fileName}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{formatBytes(recommendation.artifact.size)}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>{recommendation.artifact.sha256}</dd>
              </div>
              <div>
                <dt>图形 API</dt>
                <dd>{recommendation.artifact.graphics.api}</dd>
              </div>
            </dl>
            <div className="dl-artifact-actions">
              <a
                className="dl-button dl-button--primary"
                href={recommendation.artifact.primary.url}
              >
                <Download size={16} aria-hidden="true" />
                下载 {recommendation.artifact.platform}{" "}
                {recommendation.artifact.architecture}
              </a>
              <button
                className="dl-button dl-button--secondary"
                type="button"
                onClick={() => copyHash(recommendation.artifact!.sha256)}
              >
                <Copy size={16} aria-hidden="true" />
                {copied ? "已复制" : "复制 SHA-256"}
              </button>
            </div>
            <p className="dl-artifact-source">
              <ExternalLink size={14} aria-hidden="true" />
              {recommendation.artifact.primary.label}
            </p>
          </>
        ) : (
          <p className="dl-download-empty">{recommendation.reason}</p>
        )}
      </section>
      {recommendation.release ? (
        <p className="dl-release-meta">
          发布于 {formatDate(recommendation.release.publishedAt)} · 对应文档{" "}
          {recommendation.release.docsVersion}
        </p>
      ) : null}
    </div>
  );
}
