import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  CircleAlert,
  GitCompare,
  Network,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { supportedLocales } from "@/lib/site";
import { toolContract } from "@/lib/developer-tools";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "开发工具",
  description:
    "查询 DawnlightCore Preview contract 的诊断、Catalog 和能力矩阵。",
};

const tools = [
  {
    href: "/zh-CN/tools/diagnostics/",
    icon: CircleAlert,
    title: "Diagnostic Explorer",
    description: "按诊断代码了解触发条件、影响范围和下一步排查方向。",
    status: "可用",
  },
  {
    href: "/zh-CN/tools/catalog/",
    icon: Boxes,
    title: "Catalog Explorer",
    description:
      "浏览当前 contract 中可引用的 Stage、Service、Semantic 和 Provider ID。",
    status: "可用",
  },
  {
    href: "/zh-CN/tools/capabilities/",
    icon: Sparkles,
    title: "Capability Matrix",
    description: "查看 capability ID 和它们与 Core commit 的关系。",
    status: "可用",
  },
  {
    href: "/zh-CN/tools/pipeline/",
    icon: Network,
    title: "Pipeline Graph",
    description: "等待结构化 graph dump contract；当前只显示能力边界。",
    status: "待 contract",
  },
  {
    href: "/zh-CN/tools/variants/",
    icon: GitCompare,
    title: "Variant Explorer",
    description:
      "等待真实 variant explain 输出；不会由网页自行推断 Loader 结果。",
    status: "待 CLI",
  },
  {
    href: "/zh-CN/tools/contract-diff/",
    icon: GitCompare,
    title: "Contract Diff",
    description: "比较两个 contract snapshot 中稳定实体的新增、移除与变更。",
    status: "可用",
  },
];

export default function ToolsPage() {
  return (
    <main id="content-start" className="dl-v2-page">
      <PageContainer>
        <p className="dl-eyebrow">V2.0 Developer Tools</p>
        <h1>开发工具</h1>
        <p className="dl-v2-lede">
          从同一份 DawnlightCore contract 快照查询诊断、Catalog
          和能力边界。页面只展示有来源的结构化数据，不把 schema-only 结果冒充成
          Loader 通过。
        </p>
        <div className="dl-v2-contract-strip">
          <span>Contract {toolContract.version}</span>
          <span>Core {toolContract.coreCommit.slice(0, 8)}</span>
          <span>{toolContract.status}</span>
          <span>{toolContract.gameApiTag}</span>
        </div>
        <div className="dl-v2-card-grid">
          {tools.map(({ href, icon: Icon, title, description, status }) => (
            <Link className="dl-v2-card" href={href} key={href}>
              <div className="dl-v2-card__icon">
                <Icon size={19} aria-hidden="true" />
              </div>
              <div>
                <div className="dl-v2-card__heading">
                  <h2>{title}</h2>
                  <Badge>{status}</Badge>
                </div>
                <p>{description}</p>
                <span className="dl-v2-card__link">
                  打开工具 <ArrowRight size={15} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
        <Callout title="V2.0 数据边界">
          当前工具优先读取 V2.0 只读 API；未配置或暂时无法连接 API
          时回退到同源构建期 fixture。Pipeline graph dump 和 variant explain
          仍等待 Core/CLI 提供真实结构化输出。
        </Callout>
        <p className="dl-v2-backlink">
          <BookOpen size={15} aria-hidden="true" />
          <Link href="/zh-CN/docs/preview/00-overview/format-boundaries/">
            先阅读 JSON、GLSL 与 C# runtime 的边界
          </Link>
        </p>
      </PageContainer>
    </main>
  );
}
