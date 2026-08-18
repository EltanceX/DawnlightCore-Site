import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { diagnosticEntries, getDiagnostic } from "@/lib/developer-tools";
import { isSupportedLocale, supportedLocales } from "@/lib/site";

type Params = { locale: string; code: string };

function resolveParams(params: Params) {
  if (!isSupportedLocale(params.locale)) notFound();
  const diagnostic = getDiagnostic(params.code);
  if (!diagnostic) notFound();
  return diagnostic;
}

export function generateStaticParams() {
  return diagnosticEntries.flatMap(({ code }) =>
    supportedLocales.map((locale) => ({ locale, code })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const diagnostic = resolveParams(await params);
  return {
    title: diagnostic.code,
    description: `${diagnostic.code} · ${diagnostic.label}`,
  };
}

export default async function DiagnosticDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const diagnostic = resolveParams(await params);
  const isWarning =
    diagnostic.code === "OptionalServiceCatalogReferenceUnavailable";

  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Diagnostic Explorer</p>
        <div className="dl-v2-detail-heading">
          <span className="dl-v2-card__icon">
            <CircleAlert size={20} aria-hidden="true" />
          </span>
          <div>
            <h1>{diagnostic.code}</h1>
            <Badge>{diagnostic.label}</Badge>
          </div>
        </div>
        <p className="dl-v2-lede">{diagnostic.description}</p>
        <div className="dl-v2-fact-grid">
          <div>
            <span>状态</span>
            <strong>Preview catalog entry</strong>
          </div>
          <div>
            <span>来源</span>
            <strong>diagnostics/diagnostics.json</strong>
          </div>
          <div>
            <span>处理方</span>
            <strong>DawnlightCore Loader</strong>
          </div>
        </div>
        <Callout title="当前解释边界">
          {isWarning
            ? "这是当前 Manifest 目录中的 Warning 诊断。网站只能说明它属于可选服务引用检查；实际触发字段和是否降级必须以同一 Core commit 的 Loader JSON 结果为准。"
            : "当前 contract 只锁定诊断代码和分类。真实 Loader 输出尚未提供，因此页面不虚构具体文件路径、行号或修复成功结论。"}
        </Callout>
        <div className="dl-v2-next-actions">
          <Link
            className="dl-button dl-button--secondary"
            href="/zh-CN/tools/diagnostics/"
          >
            <ArrowLeft size={16} aria-hidden="true" /> 返回诊断目录
          </Link>
          <Link
            className="dl-button dl-button--primary"
            href="/zh-CN/docs/preview/06-reference/diagnostics/"
          >
            阅读诊断参考
          </Link>
        </div>
      </PageContainer>
    </main>
  );
}
