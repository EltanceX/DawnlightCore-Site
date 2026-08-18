import type { Metadata } from "next";
import { CapabilityExplorer } from "@/components/developer-tools/capability-explorer";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import {
  capabilityEntries,
  contractVersions,
  toolContract,
} from "@/lib/developer-tools";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Capability Matrix",
  description: "查看 DawnlightCore Preview contract 中的能力 ID。",
};

export default function CapabilitiesPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">Developer Tools / Capabilities</p>
        <h1>Capability Matrix</h1>
        <p className="dl-v2-lede">
          能力 ID 来自当前 contract。数值上限、设备差异和运行时降级仍需由 Loader
          或实机验证记录补充。
        </p>
        <CapabilityExplorer
          initialEntries={capabilityEntries}
          locale="zh-CN"
          versions={contractVersions}
        />
        <div className="dl-v2-fact-grid">
          <div>
            <span>Core commit</span>
            <strong>{toolContract.coreCommit}</strong>
          </div>
          <div>
            <span>Manifest</span>
            <strong>{toolContract.manifestVersions.join(", ")}</strong>
          </div>
          <div>
            <span>来源</span>
            <strong>catalogs/summary.json</strong>
          </div>
        </div>
        <Callout title="能力矩阵的使用方式">
          先用 capability ID 做声明和筛选，再使用真实 Loader
          结果确认是否满足包的最低要求。当前页面不替代设备探测，也不会把 Preview
          contract 变成稳定 ABI。
        </Callout>
      </PageContainer>
    </main>
  );
}
