import type { Metadata } from "next";
import { DiagnosticExplorer } from "@/components/developer-tools/diagnostic-explorer";
import { PageContainer } from "@/components/ui/page-container";
import {
  contractVersions,
  diagnosticEntries,
  toolContract,
} from "@/lib/developer-tools";
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
        <DiagnosticExplorer
          initialEntries={diagnosticEntries}
          locale="zh-CN"
          versions={contractVersions}
        />
      </PageContainer>
    </main>
  );
}
