import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { contractRoot } from "./contract-config.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith("--"))
    args.set(value.slice(2), process.argv[index + 1]);
}

const root = resolve(args.get("root") ?? contractRoot);
const readJson = (relativePath) =>
  JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileDescriptor = (kind, relativePath, status = "available") => {
  const buffer = readFileSync(resolve(root, relativePath));
  return {
    kind,
    path: relativePath,
    status,
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
  };
};

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const metadata = readJson("metadata.json");
const exportLock = readJson("contract-lock.json");
const catalogs = readJson("catalogs/summary.json");
const diagnostics = readJson("diagnostics/diagnostics.json");
const cli = readJson("cli/metadata.json");
const sourceCommit = exportLock.source.commit;
const sourceRef = (path, pointer) => ({ path, pointer, commit: sourceCommit });
const unavailableReason = {
  graph:
    "The locked Core contract does not contain a structured graph dump with nodes, edges, lifetimes and sourceRef fields.",
  variant:
    "ShaderPackCli structured output is unavailable, so the website cannot infer variant selection or exclusion reasons.",
};

const diagnosticEntries = [
  ...diagnostics.catalog.codes.map((code, index) => ({
    id: `dawnlight:diagnostic/${code}`,
    code,
    version: diagnostics.diagnosticVersion,
    status: diagnostics.status,
    group: "catalog",
    severities: [],
    catalogKinds: diagnostics.catalog.kinds,
    sourceRef: sourceRef(
      "diagnostics/diagnostics.json",
      `/catalog/codes/${index}`,
    ),
    deprecation: null,
  })),
  ...diagnostics.manifest.codes.map((code, index) => ({
    id: `dawnlight:diagnostic/${code}`,
    code,
    version: diagnostics.diagnosticVersion,
    status: diagnostics.status,
    group: "manifest",
    severities: diagnostics.manifest.severities,
    catalogKinds: [],
    sourceRef: sourceRef(
      "diagnostics/diagnostics.json",
      `/manifest/codes/${index}`,
    ),
    deprecation: null,
  })),
];

const catalogKinds = [
  ["stage-template", "stageTemplates"],
  ["service", "services"],
  ["semantic-provider", "semanticProviders"],
  ["engine-draw-provider", "engineDrawProviders"],
];
const catalogEntries = catalogKinds.flatMap(([kind, key]) =>
  catalogs[key].ids.map((id, index) => ({
    id,
    kind,
    version: String(catalogs[key].version),
    status: catalogs.status,
    sourceRef: sourceRef("catalogs/summary.json", `/${key}/ids/${index}`),
    deprecation: null,
  })),
);
const capabilityEntries = catalogs.capabilities.ids.map((id, index) => ({
  id,
  version: catalogs.catalogVersion,
  status: catalogs.status,
  sourceRef: sourceRef("catalogs/summary.json", `/capabilities/ids/${index}`),
  deprecation: null,
}));

const sourceFiles = [
  fileDescriptor("schema", "schemas/shaderpack.schema.json"),
  fileDescriptor("schema", "schemas/settings-ui.schema.json"),
  fileDescriptor("catalog", "catalogs/summary.json"),
  fileDescriptor("diagnostic", "diagnostics/diagnostics.json"),
  fileDescriptor("cli-metadata", "cli/metadata.json", cli.status),
];
const contentDigest = sha256(
  sourceFiles.map(({ path, sha256: digest }) => `${path}:${digest}`).join("\n"),
);
const fixture = {
  fixtureVersion: 1,
  contract: {
    id: `dawnlight:developer-contract/${metadata.contractVersion}`,
    version: metadata.contractVersion,
    status: exportLock.status,
    publicApiStatus: exportLock.publicApiStatus,
    sourceRepository: metadata.source.repository,
    sourceCommit,
    gameApiTag: metadata.candidate.gameApiTag,
    manifestVersions: metadata.candidate.manifestVersions,
    settingsSchemaVersions: metadata.candidate.settingsSchemaVersions,
    capturedAt: metadata.source.capturedAt,
    contentDigest,
  },
  schemas: [
    {
      id: "dawnlight:schema/shaderpack",
      version: String(metadata.candidate.manifestVersions[0]),
      status: metadata.status,
      sourceRef: sourceRef("schemas/shaderpack.schema.json", ""),
      deprecation: null,
      document: readJson("schemas/shaderpack.schema.json"),
    },
    {
      id: "dawnlight:schema/settings-ui",
      version: String(metadata.candidate.settingsSchemaVersions[0]),
      status: metadata.status,
      sourceRef: sourceRef("schemas/settings-ui.schema.json", ""),
      deprecation: null,
      document: readJson("schemas/settings-ui.schema.json"),
    },
  ],
  diagnostics: diagnosticEntries,
  catalog: catalogEntries,
  capabilities: capabilityEntries,
  graph: {
    id: "dawnlight:pipeline-graph",
    version: metadata.contractVersion,
    status: "unavailable",
    sourceRef: sourceRef("contract-manifest.json", "/availability/graph"),
    deprecation: null,
    reason: unavailableReason.graph,
    nodes: [],
    edges: [],
  },
  variant: {
    id: "dawnlight:variant-explain",
    version: metadata.contractVersion,
    status: "unavailable",
    sourceRef: sourceRef("cli/metadata.json", ""),
    deprecation: null,
    reason: unavailableReason.variant,
    explanations: [],
  },
};
const fixtureText = `${JSON.stringify(fixture, null, 2)}\n`;
writeFileSync(resolve(root, "ingest-fixture.json"), fixtureText);

const manifestWithoutSignature = {
  manifestVersion: 1,
  contractId: fixture.contract.id,
  contractVersion: fixture.contract.version,
  status: fixture.contract.status,
  publicApiStatus: fixture.contract.publicApiStatus,
  source: {
    repository: fixture.contract.sourceRepository,
    commit: sourceCommit,
    capturedAt: fixture.contract.capturedAt,
  },
  generator: {
    name: "dawnlight-contract-ingest-builder",
    version: "1.0.0",
  },
  datasets: [
    ...sourceFiles,
    fileDescriptor("normalized-fixture", "ingest-fixture.json"),
  ],
  availability: {
    schema: "available",
    diagnostic: "available",
    catalog: "available",
    capability: "available",
    graph: "unavailable",
    variant: "unavailable",
    contractDiff: "available",
  },
};
const signedPayloadSha256 = sha256(canonicalJson(manifestWithoutSignature));
const manifest = {
  ...manifestWithoutSignature,
  signature: {
    status: "unsigned-preview",
    algorithm: null,
    keyId: null,
    value: null,
    signedPayloadSha256,
    note: "No production signing key exists. Unsigned ingest is restricted to preview and non-production environments.",
  },
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(resolve(root, "contract-manifest.json"), manifestText);

const lock = {
  lockVersion: 1,
  contractId: fixture.contract.id,
  contractVersion: fixture.contract.version,
  sourceCommit,
  manifest: {
    path: "contract-manifest.json",
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256(manifestText),
  },
  normalizedFixture: {
    path: "ingest-fixture.json",
    bytes: Buffer.byteLength(fixtureText),
    sha256: sha256(fixtureText),
  },
  signatureVerification: {
    status: "skipped-unsigned-preview",
    productionEligible: false,
  },
  expectedRows: {
    schemas: fixture.schemas.length,
    diagnostics: fixture.diagnostics.length,
    catalog: fixture.catalog.length,
    capabilities: fixture.capabilities.length,
    graphs: 1,
    variants: 1,
  },
  activationPolicy: "validate-and-insert-before-atomic-activation",
};
writeFileSync(
  resolve(root, "contract-ingest-lock.json"),
  `${JSON.stringify(lock, null, 2)}\n`,
);

console.log(
  `Built contract ingest fixture (${fixture.diagnostics.length} diagnostics, ${fixture.catalog.length} catalog IDs, ${fixture.capabilities.length} capabilities).`,
);
