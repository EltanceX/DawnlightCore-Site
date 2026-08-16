import { CheckCircle2, FileCode2 } from "lucide-react";
import {
  getContractExample,
  type ContractExampleId,
  developerContract,
} from "@/lib/contract";

type VerifiedCodeBlockProps = {
  exampleId: ContractExampleId;
  language: string;
  sourcePath: string;
  verification?: string;
};

export function VerifiedCodeBlock({
  exampleId,
  language,
  sourcePath,
  verification = "schema + source hash",
}: VerifiedCodeBlockProps) {
  const code = getContractExample(exampleId);

  return (
    <figure className="dl-verified-code">
      <figcaption className="dl-verified-code__caption">
        <span className="dl-verified-code__source">
          <FileCode2 size={15} aria-hidden="true" />
          <span>{sourcePath}</span>
        </span>
        <span className="dl-verified-code__status">
          <CheckCircle2 size={14} aria-hidden="true" />
          {verification} · Core{" "}
          {developerContract.lock.source.commit.slice(0, 8)}
        </span>
      </figcaption>
      <pre>
        <code data-language={language}>{code}</code>
      </pre>
    </figure>
  );
}
