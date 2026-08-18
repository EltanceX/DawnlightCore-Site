import contractMetadata from "../../../../contracts/dawnlight/preview/metadata.json";
import contractLock from "../../../../contracts/dawnlight/preview/contract-lock.json";

export type DirectoryProject = {
  slug: string;
  name: string;
  status: "preview";
  kind: "contract-candidate";
  description: string;
  shaderPackId: string;
  latestVersion: string;
  coreCommit: string;
  contractVersion: string;
  verification: "schema-only";
  artifactCount: 0;
  downloadable: false;
  compatibility: {
    gameApiTag: string;
    manifestVersion: number;
    settingsSchemaVersion: number;
  };
  limitation: string;
};

export const shaderProjects: readonly DirectoryProject[] = [
  {
    slug: "dawnlight-v3-1",
    name: "Dawnlight v3.1",
    status: "preview",
    kind: "contract-candidate",
    description:
      "来自当前 DawnlightCore contract candidate 的光影包元数据，用于验证目录、版本和兼容性展示。",
    shaderPackId: contractMetadata.candidate.shaderPackId,
    latestVersion: contractMetadata.candidate.shaderPackVersion,
    coreCommit: contractLock.source.commit,
    contractVersion: contractMetadata.contractVersion,
    verification: "schema-only",
    artifactCount: 0,
    downloadable: false,
    compatibility: {
      gameApiTag: contractMetadata.candidate.gameApiTag,
      manifestVersion: contractMetadata.candidate.manifestVersions[0],
      settingsSchemaVersion:
        contractMetadata.candidate.settingsSchemaVersions[0],
    },
    limitation:
      "当前没有公开 release artifact、文件 hash、签名或实机兼容性记录；此条目不能下载。",
  },
];

export function getShaderProject(slug: string) {
  return shaderProjects.find((project) => project.slug === slug);
}
