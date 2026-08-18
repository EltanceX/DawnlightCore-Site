import type { Metadata } from "next";
import { ContractDiffExplorer } from "@/components/developer-tools/contract-diff-explorer";
import { PageContainer } from "@/components/ui/page-container";
import { contractVersions, emptyContractDiff } from "@/lib/developer-tools";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Contract Diff",
  description: "比较 DawnlightCore contract snapshot 的稳定实体变更。",
};

export default function ContractDiffPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Developer Tools / Contract Diff</p>
        <h1>Contract Diff</h1>
        <p className="dl-v2-lede">
          比较两个已 ingest 的 contract snapshot。结果只覆盖 contract 中可寻址的
          schema、诊断、Catalog、Capability、Graph 和 Variant 实体，不推断 C#
          内部实现变化。
        </p>
        <ContractDiffExplorer
          initialDiff={emptyContractDiff}
          versions={contractVersions}
        />
      </PageContainer>
    </main>
  );
}
