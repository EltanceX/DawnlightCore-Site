import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-container";
import { diagnosticEntries, toolContract } from "@/lib/developer-tools";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Diagnostic Explorer",
  description: "浏览 DawnlightCore Preview contract 的诊断代码。",
};

export default function DiagnosticsPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Developer Tools / Diagnostics</p>
        <h1>Diagnostic Explorer</h1>
        <p className="dl-v2-lede">
          诊断代码来自 {toolContract.version}。当前快照提供代码目录和分类；具体
          Loader 结果仍必须绑定实际 Core 运行记录。
        </p>
        <div className="dl-v2-list">
          {diagnosticEntries.map((entry) => (
            <Link
              className="dl-v2-list-item"
              href={`/zh-CN/tools/diagnostics/${entry.code}/`}
              key={entry.code}
            >
              <span className="dl-v2-list-item__icon">
                <CircleAlert size={17} aria-hidden="true" />
              </span>
              <span className="dl-v2-list-item__body">
                <strong>{entry.code}</strong>
                <span>{entry.description}</span>
              </span>
              <Badge>{entry.label}</Badge>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </PageContainer>
    </main>
  );
}
