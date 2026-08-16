import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Download,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-container";
import { siteConfig, supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function HomePage() {
  return (
    <main id="content-start" className="dl-home">
      <section className="dl-home__hero" aria-labelledby="home-title">
        <PageContainer className="dl-home__hero-inner">
          <div className="dl-home__hero-copy">
            <Badge>Survivalcraft shader pipeline</Badge>
            <h1 id="home-title">{siteConfig.name}</h1>
            <p>
              面向 Dawnlight 光影开发者的版本化文档、合同快照与官方发布入口。
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
              Preview channel
            </div>
            <p>Manifest v3</p>
            <span>固定 contract 快照 · 静态发布</span>
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
                <span>Preview · Manifest v3</span>
              </div>
            </div>
            <div className="dl-home__status-item">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <p>发布模式</p>
                <span>静态站点 · 可校验下载</span>
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
              <h2 id="next-title">从最小光影包开始</h2>
            </div>
            <Link className="dl-text-link" href="/zh-CN/docs/preview/">
              查看文档目录 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="dl-home__next-grid">
            <article>
              <span className="dl-home__step">01</span>
              <h3>理解数据边界</h3>
              <p>了解 JSON、GLSL 与 C# Catalog 在通用管线中的职责。</p>
            </article>
            <article>
              <span className="dl-home__step">02</span>
              <h3>描述一个 Manifest</h3>
              <p>
                从固定的 Manifest v3 结构开始组织 programs、resources 与
                passes。
              </p>
            </article>
            <article>
              <span className="dl-home__step">03</span>
              <h3>用 CLI 验证</h3>
              <p>让结构化诊断在发布前暴露问题，而不是留给游戏运行时。</p>
            </article>
          </div>
        </PageContainer>
      </section>
    </main>
  );
}
