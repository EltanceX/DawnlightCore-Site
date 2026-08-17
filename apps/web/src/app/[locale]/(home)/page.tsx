import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Braces,
  CircleAlert,
  Download,
  GitBranch,
  ListChecks,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-container";
import { developerContract } from "@/lib/contract";
import {
  formatDate,
  latestAvailableRelease,
  releaseFeed,
} from "@/lib/releases";
import { siteConfig, supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: { absolute: siteConfig.name },
  description: siteConfig.description,
};

export default function HomePage() {
  const latestRelease = latestAvailableRelease(releaseFeed);
  const releaseCount = releaseFeed.releases.filter(
    (release) => release.status === "available",
  ).length;

  return (
    <main id="content-start" className="dl-home">
      <section className="dl-home__hero" aria-labelledby="home-title">
        <PageContainer className="dl-home__hero-inner">
          <div className="dl-home__hero-copy">
            <Badge>Preview developer portal</Badge>
            <h1 id="home-title">{siteConfig.name}</h1>
            <p>
              为 Survivalcraft
              光影作者提供版本化管线文档、可追溯合同快照与官方发布入口。
            </p>
            <p className="dl-home__hero-disclosure">
              Hero Preview 概念渲染 · 非 Dawnlight 实机截图
            </p>
            <div className="dl-home__actions">
              <Link
                className="dl-button dl-button--primary"
                href="/zh-CN/docs/preview/"
              >
                <BookOpen size={16} aria-hidden="true" />
                开始阅读文档
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                className="dl-button dl-button--secondary"
                href="/zh-CN/downloads/"
              >
                <Download size={16} aria-hidden="true" />
                查看下载
              </Link>
            </div>
          </div>
          <div className="dl-home__signal" aria-label="当前版本状态">
            <div className="dl-home__signal-line">
              <span className="dl-home__signal-dot" aria-hidden="true" />
              {latestRelease
                ? `${latestRelease.channel} channel`
                : "Docs-only preview"}
            </div>
            <p>{latestRelease ? latestRelease.version : "Manifest v3"}</p>
            <span>
              {latestRelease
                ? `${formatDate(latestRelease.publishedAt)} · ${latestRelease.artifacts.length} artifacts`
                : "正式 artifact 尚未冻结 · 静态发布"}
            </span>
          </div>
        </PageContainer>
      </section>
      <section className="dl-home__status" aria-labelledby="status-title">
        <PageContainer>
          <h2 id="status-title" className="sr-only">
            当前状态
          </h2>
          <div className="dl-home__status-grid">
            <div className="dl-home__status-item">
              <GitBranch size={17} aria-hidden="true" />
              <div>
                <p>文档版本</p>
                <span>
                  Preview · Core{" "}
                  {developerContract.lock.source.commit.slice(0, 8)}
                </span>
              </div>
            </div>
            <div className="dl-home__status-item">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <p>发布模式</p>
                <span>
                  {releaseCount > 0
                    ? `${releaseCount} 个可用 release`
                    : "Release Feed v1 · 当前无 artifact"}
                </span>
              </div>
            </div>
            <div className="dl-home__status-item">
              <BookOpen size={17} aria-hidden="true" />
              <div>
                <p>首发语言</p>
                <span>简体中文（zh-CN）</span>
              </div>
            </div>
          </div>
        </PageContainer>
      </section>
      <section className="dl-home__next" aria-labelledby="next-title">
        <PageContainer>
          <div className="dl-home__next-heading">
            <div>
              <p className="dl-eyebrow">Developer path</p>
              <h2 id="next-title">开发者入口</h2>
            </div>
            <Link className="dl-text-link" href="/zh-CN/docs/preview/">
              查看文档目录 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="dl-home__next-grid">
            <article>
              <Braces size={18} aria-hidden="true" />
              <h3>
                <Link href="/zh-CN/docs/preview/01-getting-started/first-minimal-pack/">
                  最小光影包
                </Link>
              </h3>
              <p>从 contract 快照中的最小 Manifest 建立可复现的包结构。</p>
            </article>
            <article>
              <Boxes size={18} aria-hidden="true" />
              <h3>
                <Link href="/zh-CN/docs/preview/03-manifest/root-and-fragments/">
                  Manifest v3
                </Link>
              </h3>
              <p>组织 Programs、Resources、Passes、Semantics 与 fragments。</p>
            </article>
            <article>
              <Settings2 size={18} aria-hidden="true" />
              <h3>
                <Link href="/zh-CN/docs/preview/04-settings-ui/overview/">
                  Settings UI
                </Link>
              </h3>
              <p>建立页面、分组、控件、条件与本地化键。</p>
            </article>
            <article>
              <TerminalSquare size={18} aria-hidden="true" />
              <h3>
                <Link href="/zh-CN/docs/preview/01-getting-started/validate-with-cli/">
                  验证与诊断
                </Link>
              </h3>
              <p>
                区分 schema-only 与 Loader 验证；当前生产 CLI contract
                尚未提供。
              </p>
            </article>
          </div>
        </PageContainer>
      </section>
      <section
        className="dl-home__capabilities"
        aria-labelledby="capabilities-title"
      >
        <PageContainer>
          <div className="dl-home__next-heading">
            <div>
              <p className="dl-eyebrow">Contract boundary</p>
              <h2 id="capabilities-title">当前能力与边界</h2>
            </div>
            <Link
              className="dl-text-link"
              href="/zh-CN/docs/preview/00-overview/capabilities-and-limitations/"
            >
              完整能力矩阵 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="dl-home__capability-grid">
            <div>
              <ListChecks size={18} aria-hidden="true" />
              <h3>JSON 驱动</h3>
              <p>Program、Resource、Pass 和 Settings UI 使用版本化合同描述。</p>
            </div>
            <div>
              <ShieldCheck size={18} aria-hidden="true" />
              <h3>受信 Catalog</h3>
              <p>Stage、Service、Semantic 和 EngineDraw ID 由 Core 提供。</p>
            </div>
            <div>
              <CircleAlert size={18} aria-hidden="true" />
              <h3>Preview 边界</h3>
              <p>
                当前快照不是稳定 ABI；正式 CLI、artifact 和 Hero 资产仍未冻结。
              </p>
            </div>
          </div>
        </PageContainer>
      </section>
      {releaseFeed.releases.length > 0 ? (
        <section className="dl-home__releases" aria-labelledby="releases-title">
          <PageContainer>
            <div className="dl-home__next-heading">
              <div>
                <p className="dl-eyebrow">Release feed</p>
                <h2 id="releases-title">最新发布</h2>
              </div>
              <Link className="dl-text-link" href="/zh-CN/downloads/releases/">
                全部记录 <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <div className="dl-home__release-list">
              {releaseFeed.releases.slice(0, 3).map((release) => (
                <div key={release.id}>
                  <strong>{release.version}</strong>
                  <span>
                    {release.channel} · {formatDate(release.publishedAt)}
                  </span>
                  <p>{release.summary}</p>
                </div>
              ))}
            </div>
          </PageContainer>
        </section>
      ) : null}
    </main>
  );
}
