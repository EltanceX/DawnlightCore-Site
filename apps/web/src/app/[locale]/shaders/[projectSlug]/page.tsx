import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Download, FileCheck2, ShieldAlert } from "lucide-react";
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
    description: project.description,
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
        <p className="dl-v2-lede">{project.description}</p>
        <div className="dl-v2-fact-grid">
          <div>
            <span>Shader Pack ID</span>
            <strong>{project.shaderPackId}</strong>
          </div>
          <div>
            <span>版本</span>
            <strong>{project.latestVersion}</strong>
          </div>
          <div>
            <span>Contract</span>
            <strong>{project.contractVersion}</strong>
          </div>
          <div>
            <span>Core commit</span>
            <strong>{project.coreCommit}</strong>
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
              <Badge>{project.verification}</Badge>
            </div>
          </div>
          <div className="dl-v2-fact-grid">
            <div>
              <span>游戏 API</span>
              <strong>{project.compatibility.gameApiTag}</strong>
            </div>
            <div>
              <span>Manifest</span>
              <strong>v{project.compatibility.manifestVersion}</strong>
            </div>
            <div>
              <span>Settings UI</span>
              <strong>v{project.compatibility.settingsSchemaVersion}</strong>
            </div>
          </div>
        </section>
        <Callout title="当前不能下载">
          <span>{project.limitation}</span>
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
