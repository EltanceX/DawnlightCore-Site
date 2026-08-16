import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contractRoot,
  defaultCommit,
  defaultCoreRepository,
  sourceFiles,
} from "./contract-config.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith("--"))
    args.set(value.slice(2), process.argv[index + 1]);
}

const repository = resolve(args.get("repo") ?? defaultCoreRepository);
const commit = args.get("commit") ?? defaultCommit;
const outputRoot = resolve(args.get("output") ?? contractRoot);

function git(...gitArgs) {
  return execFileSync("git", ["-C", repository, ...gitArgs], {
    encoding: "utf8",
  }).trim();
}

git("cat-file", "-e", `${commit}^{commit}`);
const capturedAt = git("show", "-s", "--format=%cI", commit);
const tree = git("ls-tree", "-r", "--name-only", commit);
const treePaths = new Set(tree.split(/\r?\n/).filter(Boolean));

for (const file of sourceFiles) {
  if (!treePaths.has(file.source)) {
    throw new Error(
      `Locked commit does not contain source path: ${file.source}`,
    );
  }
  const content = execFileSync("git", [
    "-C",
    repository,
    "show",
    `${commit}:${file.source}`,
  ]);
  const destination = resolve(outputRoot, file.output);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

const metadata = {
  contractKind: "dawnlight-developer-contract",
  contractVersion: "preview-2026-08-16",
  status: "preview",
  publicApiStatus: "preview-only",
  source: {
    repository: "https://github.com/EltanceX/DawnlightCore.git",
    ref: "dawnlight-upgrade-1.9.2.1-vr",
    commit,
    exportMode: "commit-tree-only",
    capturedAt,
  },
  candidate: {
    gameApiTag: "API_1.9.2.1",
    manifestVersions: [3],
    settingsSchemaVersions: [1],
    shaderPackId: "dawnlight:dawnlight_v3_1",
    shaderPackVersion: "3.1",
  },
  generatedFiles: sourceFiles.map((file) => file.output),
  generatedBy: "scripts/sync-dawnlight-contract.mjs",
};
writeFileSync(
  resolve(outputRoot, "metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

const hashFile = (relativePath) => {
  const buffer = readFileSync(resolve(outputRoot, relativePath));
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
};

const generated = [
  ...sourceFiles.map((file) => ({
    ...hashFile(file.output),
    sourcePath: file.source,
  })),
  ...[
    "metadata.json",
    "schemas/shaderpack.schema.json",
    "schemas/settings-ui.schema.json",
    "catalogs/summary.json",
    "diagnostics/diagnostics.json",
    "cli/metadata.json",
    "examples/verification.json",
  ].map((file) => hashFile(file)),
];

const lock = {
  contractKind: "dawnlight-developer-contract",
  contractVersion: "preview-2026-08-16",
  status: "preview-validated",
  publicApiStatus: "preview-only",
  source: {
    repository: metadata.source.repository,
    ref: metadata.source.ref,
    commit,
    exportMode: "commit-tree-only",
    workingTreeAtInspection: "dirty",
    workingTreeNote:
      "The export was read from the locked commit tree with git show; no local working-tree files were read.",
    capturedAt,
  },
  distributionSource: "https://gitee.com/SC-SPM/SurvivalcraftApi.git",
  candidate: metadata.candidate,
  files: generated,
  validation: {
    schema: "website-preview-schema",
    examples: "schema-and-source-metadata",
    cli: "unavailable",
  },
  blockingReasons: [
    "The contract is preview-only and is not a stable public ABI.",
    "A production CLI JSON output contract is not available in this snapshot.",
  ],
  capturedAt,
};
writeFileSync(
  resolve(outputRoot, "contract-lock.json"),
  `${JSON.stringify(lock, null, 2)}\n`,
);
console.log(`Exported ${generated.length} contract files from ${commit}.`);
