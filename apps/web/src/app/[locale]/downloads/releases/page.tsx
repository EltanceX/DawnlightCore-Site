import Link from "next/link";
import { CalendarDays, Package } from "lucide-react";
import { formatDate, releaseFeed } from "@/lib/releases";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function ReleasesPage() {
  const releases = [...releaseFeed.releases].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  return (
    <main id="content-start" className="dl-release-page">
      <div className="dl-page-container">
        <p className="dl-eyebrow">Release history</p>
        <h1>发布记录</h1>
        <p className="dl-release-page__intro">
          每条记录关联 Core API、Manifest 版本、文档版本和不可变
          artifact。撤回版本保留在历史中，但不会成为推荐下载。
        </p>
        {releases.length === 0 ? (
          <section className="dl-download-status" aria-live="polite">
            <Package size={20} aria-hidden="true" />
            <div>
              <h2>Preview feed 尚无发布记录</h2>
              <p>
                正式 artifact 和更新日志通过校验后，发布记录会从同一份 feed
                自动生成。
              </p>
              <Link href="/zh-CN/downloads/">返回下载选择</Link>
            </div>
          </section>
        ) : (
          <div className="dl-release-list">
            {releases.map((release) => (
              <article key={release.id} className="dl-release-row">
                <div>
                  <div className="dl-release-row__heading">
                    <h2>{release.version}</h2>
                    <span className="dl-release-channel">
                      {release.channel}
                    </span>
                    <span
                      className={`dl-release-status dl-release-status--${release.status}`}
                    >
                      {release.status}
                    </span>
                  </div>
                  <p>{release.summary}</p>
                  <span className="dl-release-row__date">
                    <CalendarDays size={14} aria-hidden="true" />
                    {formatDate(release.publishedAt)}
                  </span>
                </div>
                <span className="dl-release-row__count">
                  {release.artifacts.length} 个 artifacts
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
