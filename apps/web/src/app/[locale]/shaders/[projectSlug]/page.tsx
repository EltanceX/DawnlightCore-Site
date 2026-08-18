import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Download,
  FileCheck2,
  ImageOff,
  ShieldAlert,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { getShaderProject, shaderProjects } from "@/lib/shader-directory";
import { isSupportedLocale, supportedLocales } from "@/lib/site";

type Params = { locale: string; projectSlug: string };

function resolveProject(params: Params) {
  if (!isSupportedLocale(params.locale)) notFound();
  const project = getShaderProject(params.projectSlug);
  if (!project) notFound();
  return project;
}

export function generateStaticParams() {
  return shaderProjects.flatMap((project) =>
    supportedLocales.map((locale) => ({ locale, projectSlug: project.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const project = resolveProject(await params);
  return {
    title: project.name,
    description: project.summary,
  };
}

export default async function ShaderProjectPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const project = resolveProject(await params);

  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Shader Directory / Project</p>
        <div className="dl-v2-detail-heading">
          <span className="dl-v2-card__icon">
            <FileCheck2 size={20} aria-hidden="true" />
          </span>
          <div>
            <h1>{project.name}</h1>
            <Badge>{project.status}</Badge>
          </div>
        </div>
        <p className="dl-v2-lede">{project.summary}</p>
        <div className="dl-v2-fact-grid">
          <div>
            <span>Shader Pack ID</span>
            <strong>{project.id}</strong>
          </div>
          <div>
            <span>版本</span>
            <strong>{project.latestVersion?.version ?? "—"}</strong>
          </div>
          <div>
            <span>Contract</span>
            <strong>{project.latestVersion?.contractVersion ?? "—"}</strong>
          </div>
          <div>
            <span>Core commit</span>
            <strong>{project.latestVersion?.coreCommit ?? "—"}</strong>
          </div>
        </div>
        <section
          className="dl-v2-detail-section"
          aria-labelledby="compatibility-title"
        >
          <div className="dl-v2-section-heading">
            <div className="dl-v2-card__icon">
              <ShieldAlert size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 id="compatibility-title">兼容性记录</h2>
              <Badge>
                {project.compatibilities[0]?.status ?? "unverified"}
              </Badge>
            </div>
          </div>
          <div className="dl-v2-fact-grid">
            <div>
              <span>游戏 API</span>
              <strong>{project.latestVersion?.gameApiTag ?? "—"}</strong>
            </div>
            <div>
              <span>Manifest</span>
              <strong>v{project.latestVersion?.manifestVersion ?? "—"}</strong>
            </div>
            <div>
              <span>Settings UI</span>
              <strong>
                v{project.latestVersion?.settingsSchemaVersion ?? "—"}
              </strong>
            </div>
          </div>
          <p className="dl-directory-compatibility">
            <ShieldAlert size={15} aria-hidden="true" />
            {project.compatibilities[0]?.reason ?? "暂无兼容性记录。"}
          </p>
        </section>
        <section
          className="dl-v2-detail-section"
          aria-labelledby="versions-title"
        >
          <div className="dl-v2-section-heading">
            <div className="dl-v2-card__icon">
              <FileCheck2 size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 id="versions-title">项目版本</h2>
              <Badge>{project.versions.length} 个版本</Badge>
            </div>
          </div>
          <div className="dl-directory-version-list">
            {project.versions.map((version) => (
              <article className="dl-directory-version" key={version.id}>
                <div>
                  <strong>{version.version}</strong>
                  <Badge>{version.channel}</Badge>
                  <Badge>{version.status}</Badge>
                </div>
                <span>
                  {version.verification} · {version.artifactIds.length}{" "}
                  artifacts
                </span>
                <code>{version.coreCommit}</code>
              </article>
            ))}
          </div>
        </section>
        <section
          className="dl-v2-detail-section"
          aria-labelledby="license-title"
        >
          <div className="dl-v2-section-heading">
            <div className="dl-v2-card__icon">
              <ShieldAlert size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 id="license-title">许可证与预览资产</h2>
              <Badge>{project.license?.status ?? "unknown"}</Badge>
            </div>
          </div>
          <div className="dl-directory-license">
            <p>{project.license?.reason ?? "暂无许可证记录。"}</p>
            <p>
              <ImageOff size={15} aria-hidden="true" />
              {project.images.length > 0
                ? `${project.images.length} 张已核对图片`
                : "当前没有可核对的项目图片。"}
            </p>
          </div>
        </section>
        <Callout title="当前不能下载">
          <span>
            {project.recommendation.exclusions[0] ??
              project.recommendation.reasons[0]}
          </span>
          <span className="dl-v2-inline-icon">
            <Download size={15} aria-hidden="true" />
            等待真实 release artifact
            后，这里才会显示文件大小、SHA-256、签名和镜像。
          </span>
        </Callout>
        <div className="dl-v2-next-actions">
          <Link
            className="dl-button dl-button--secondary"
            href="/zh-CN/shaders/"
          >
            <ArrowLeft size={16} aria-hidden="true" /> 返回光影目录
          </Link>
          <Link className="dl-button dl-button--primary" href="/zh-CN/tools/">
            查看开发工具
          </Link>
        </div>
      </PageContainer>
    </main>
  );
}
