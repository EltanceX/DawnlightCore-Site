import type { Metadata } from "next";
import { GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { variantAvailability } from "@/lib/developer-tools";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Variant Explorer",
  description: "查看 DawnlightCore Variant explain contract 的可用性状态。",
};

export default function VariantsPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Developer Tools / Variants</p>
        <div className="dl-v2-detail-heading">
          <span className="dl-v2-card__icon">
            <GitCompare size={20} aria-hidden="true" />
          </span>
          <div>
            <h1>Variant Explorer</h1>
            <Badge>待 CLI</Badge>
          </div>
        </div>
        <p className="dl-v2-lede">
          当前 contract 状态：{variantAvailability.status}。网页不会自行枚举
          defines 或推断最终 shader variant。
        </p>
        <Callout title="下一步接入条件">
          {variantAvailability.reason} CLI 需要输出
          option、define、排除原因、最终选择、 Core commit 和输入
          hash。接入后页面将支持跨版本 diff，并把每一条结果链接回 Manifest
          字段和诊断代码。
        </Callout>
      </PageContainer>
    </main>
  );
}
