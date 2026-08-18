import type { Metadata } from "next";
import { CatalogExplorer } from "@/components/developer-tools/catalog-explorer";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import {
  catalogEntries,
  contractVersions,
  toolContract,
} from "@/lib/developer-tools";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Catalog Explorer",
  description: "浏览 DawnlightCore Preview contract 的 Catalog ID。",
};

export default function CatalogPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Developer Tools / Catalog</p>
        <h1>Catalog Explorer</h1>
        <p className="dl-v2-lede">
          当前目录快照来自 Core {toolContract.coreCommit.slice(0, 8)}。ID
          可以用于阅读和 schema 引用，但不代表所有图形设备上都有相同运行能力。
        </p>
        <CatalogExplorer
          initialEntries={catalogEntries}
          locale="zh-CN"
          versions={contractVersions}
        />
        <Callout title="Catalog 不是私有 C# API 的镜像">
          只有进入版本化 contract 的 ID
          才能被光影包依赖。未出现在目录中的内部类型、factory
          或宿主约定不能通过拼写推断出来。
        </Callout>
      </PageContainer>
    </main>
  );
}
