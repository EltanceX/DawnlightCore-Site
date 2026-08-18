import type { Metadata } from "next";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { graphAvailability } from "@/lib/developer-tools";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Pipeline Graph",
  description: "查看 DawnlightCore Pipeline Graph contract 的可用性状态。",
};

export default function PipelinePage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Developer Tools / Pipeline</p>
        <div className="dl-v2-detail-heading">
          <span className="dl-v2-card__icon">
            <Network size={20} aria-hidden="true" />
          </span>
          <div>
            <h1>Pipeline Graph</h1>
            <Badge>待 contract</Badge>
          </div>
        </div>
        <p className="dl-v2-lede">
          当前 contract 状态：{graphAvailability.status}。页面不会绘制未被
          ingest snapshot 提供的 Pass、Resource 或执行边。
        </p>
        <Callout title="下一步接入条件">
          {graphAvailability.reason} Core CI 需要生成包含节点
          ID、边、资源生命周期和 sourceRef 的 graph dump，并绑定 Core
          commit、Manifest 版本和 hash。 接入后这里再启用图形化查看和列表降级。
        </Callout>
      </PageContainer>
    </main>
  );
}
