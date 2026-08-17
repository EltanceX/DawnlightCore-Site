import { CheckCircle2, FlaskConical, ShieldAlert } from "lucide-react";
import { developerContract } from "@/lib/contract";
import { siteConfig } from "@/lib/site";

type DocsContractMetaProps = {
  coreVersion?: string;
  manifestVersion?: string;
  settingsSchemaVersion?: string;
  status?: "preview" | "experimental" | "stable" | "deprecated";
  lastVerifiedWith?: string;
};

const statusCopy = {
  preview: {
    label: "Preview 合同",
    description: "字段和行为仍可能变化，不应视为稳定 ABI。",
    Icon: FlaskConical,
  },
  experimental: {
    label: "实验能力",
    description: "适合试验性光影包，发布前请固定验证结果。",
    Icon: FlaskConical,
  },
  stable: {
    label: "稳定参考",
    description: "该页面按当前稳定合同维护。",
    Icon: CheckCircle2,
  },
  deprecated: {
    label: "已弃用",
    description: "请迁移到当前版本的替代字段或页面。",
    Icon: ShieldAlert,
  },
} as const;

export function DocsContractMeta({
  coreVersion = siteConfig.docsVersions[0].coreVersion,
  manifestVersion,
  settingsSchemaVersion,
  status = "preview",
  lastVerifiedWith = developerContract.lock.source.commit.slice(0, 8),
}: DocsContractMetaProps) {
  const copy = statusCopy[status];
  const Icon = copy.Icon;

  return (
    <aside className="dl-docs-contract" aria-label="文档合同状态">
      <div className="dl-docs-contract__status">
        <Icon size={16} aria-hidden="true" />
        <div>
          <strong>{copy.label}</strong>
          <p>{copy.description}</p>
        </div>
      </div>
      <dl className="dl-docs-contract__facts">
        <div>
          <dt>Core</dt>
          <dd>{coreVersion}</dd>
        </div>
        {manifestVersion ? (
          <div>
            <dt>Manifest</dt>
            <dd>{manifestVersion}</dd>
          </div>
        ) : null}
        {settingsSchemaVersion ? (
          <div>
            <dt>Settings UI</dt>
            <dd>{settingsSchemaVersion}</dd>
          </div>
        ) : null}
        <div>
          <dt>验证</dt>
          <dd>{lastVerifiedWith}</dd>
        </div>
      </dl>
    </aside>
  );
}
