import Link from "next/link";
import type { Metadata } from "next";
import { Boxes, ShieldCheck } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { DirectoryExplorer } from "@/components/directory/directory-explorer";
import { PageContainer } from "@/components/ui/page-container";
import { shaderProjects } from "@/lib/shader-directory";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "光影目录",
  description: "浏览 DawnlightCore 维护者确认的光影项目和兼容性信息。",
};

export default function ShadersPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">V2.0 Shader Directory</p>
        <h1>光影目录</h1>
        <p className="dl-v2-lede">
          这里先展示维护者确认的项目元数据、版本和兼容性边界。V2.0
          尚未开放投稿，也不会为没有真实 artifact 的项目提供下载按钮。
        </p>
        <div className="dl-v2-directory-notice">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            当前目录为 Preview catalog，所有条目都必须显示验证状态和可下载性。
          </span>
        </div>
        <DirectoryExplorer
          initialProjects={[...shaderProjects]}
          locale="zh-CN"
        />
        <Callout title="为什么当前没有下载按钮？">
          目录条目只有在获得真实文件、大小、SHA-256、签名、许可证和
          Loader/兼容性记录后才能进入 Release Feed。请先查看
          <Link href="/zh-CN/downloads/">官方下载页</Link>。
        </Callout>
        <p className="dl-v2-backlink">
          <Boxes size={15} aria-hidden="true" />
          <Link href="/zh-CN/tools/">查看开发工具</Link>
        </p>
      </PageContainer>
    </main>
  );
}
