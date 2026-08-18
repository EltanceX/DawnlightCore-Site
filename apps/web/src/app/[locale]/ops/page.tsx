import type { Metadata } from "next";
import { OperationsConsole } from "@/components/operations/operations-console";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "运营控制台",
  description: "DawnlightCore 私有聚合指标、举报和审核运营入口。",
  robots: { index: false, follow: false },
};

export default function OperationsPage() {
  return (
    <main id="content-start" className="dl-v2-page dl-author-page">
      <PageContainer>
        <p className="dl-eyebrow">V2.1 Operations</p>
        <h1>运营控制台</h1>
        <p className="dl-v2-lede">
          查看队列、Loader
          失败、下载聚合和举报队列，并执行有原因、有审计的撤回或可见性操作。
        </p>
        <Callout title="隐私与权限边界">
          仅平台管理员可读取；页面不展示原始光影包、签名 URL、长期 IP
          或个人下载画像。存储容量未知时明确显示 unavailable。
        </Callout>
        <OperationsConsole />
      </PageContainer>
    </main>
  );
}
