import { z } from "zod";

export const contractStatusSchema = z.enum([
  "preview",
  "preview-validated",
  "available",
  "unavailable",
  "deprecated",
]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const sourceRefSchema = z.object({
  path: z.string().min(1),
  pointer: z.string(),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const deprecationSchema = z
  .object({
    since: z.string().min(1),
    replacement: z.string().min(1).nullable(),
    message: z.string().min(1),
  })
  .nullable();
export type Deprecation = z.infer<typeof deprecationSchema>;

const entryBaseSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  status: contractStatusSchema,
  sourceRef: sourceRefSchema,
  deprecation: deprecationSchema,
});

export const contractFixtureSchema = z.object({
  fixtureVersion: z.literal(1),
  contract: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    status: contractStatusSchema,
    publicApiStatus: z.enum(["preview-only", "stable"]),
    sourceRepository: z.string().url(),
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    gameApiTag: z.string().min(1),
    manifestVersions: z.array(z.number().int().positive()),
    settingsSchemaVersions: z.array(z.number().int().positive()),
    capturedAt: z.string().min(1),
    contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  schemas: z.array(
    entryBaseSchema.extend({
      document: z.unknown(),
    }),
  ),
  diagnostics: z.array(
    entryBaseSchema.extend({
      code: z.string().min(1),
      group: z.enum(["catalog", "manifest"]),
      severities: z.array(z.string()),
      catalogKinds: z.array(z.string()),
    }),
  ),
  catalog: z.array(
    entryBaseSchema.extend({
      kind: z.enum([
        "stage-template",
        "service",
        "semantic-provider",
        "engine-draw-provider",
      ]),
    }),
  ),
  capabilities: z.array(entryBaseSchema),
  graph: entryBaseSchema.extend({
    reason: z.string().nullable(),
    nodes: z.array(z.record(z.string(), z.unknown())),
    edges: z.array(z.record(z.string(), z.unknown())),
  }),
  variant: entryBaseSchema.extend({
    reason: z.string().nullable(),
    explanations: z.array(z.record(z.string(), z.unknown())),
  }),
});

export type ContractFixture = z.infer<typeof contractFixtureSchema>;
export type ContractSummary = ContractFixture["contract"];
export type ContractSchemaRecord = ContractFixture["schemas"][number];
export type DiagnosticRecord = ContractFixture["diagnostics"][number];
export type CatalogRecord = ContractFixture["catalog"][number];
export type CapabilityRecord = ContractFixture["capabilities"][number];
export type GraphRecord = ContractFixture["graph"];
export type VariantRecord = ContractFixture["variant"];
export type CatalogKind = CatalogRecord["kind"];

export const contractManifestSchema = z.object({
  manifestVersion: z.literal(1),
  contractId: z.string().min(1),
  contractVersion: z.string().min(1),
  status: contractStatusSchema,
  publicApiStatus: z.enum(["preview-only", "stable"]),
  source: z.object({
    repository: z.string().url(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    capturedAt: z.string().min(1),
  }),
  generator: z.object({ name: z.string().min(1), version: z.string().min(1) }),
  datasets: z.array(
    z.object({
      kind: z.string().min(1),
      path: z.string().min(1),
      status: z.string().min(1),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
  availability: z.record(z.string(), z.enum(["available", "unavailable"])),
  signature: z.object({
    status: z.enum(["unsigned-preview", "signed"]),
    algorithm: z.literal("ed25519").nullable(),
    keyId: z.string().min(1).nullable(),
    value: z.string().min(1).nullable(),
    signedPayloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
    note: z.string().optional(),
  }),
});
export type ContractManifest = z.infer<typeof contractManifestSchema>;

export const contractIngestLockSchema = z.object({
  lockVersion: z.literal(1),
  contractId: z.string().min(1),
  contractVersion: z.string().min(1),
  sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
  manifest: z.object({
    path: z.literal("contract-manifest.json"),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  normalizedFixture: z.object({
    path: z.literal("ingest-fixture.json"),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  signatureVerification: z.object({
    status: z.enum(["verified", "skipped-unsigned-preview"]),
    productionEligible: z.boolean(),
  }),
  expectedRows: z.object({
    schemas: z.number().int().nonnegative(),
    diagnostics: z.number().int().nonnegative(),
    catalog: z.number().int().nonnegative(),
    capabilities: z.number().int().nonnegative(),
    graphs: z.number().int().nonnegative(),
    variants: z.number().int().nonnegative(),
  }),
  activationPolicy: z.literal("validate-and-insert-before-atomic-activation"),
});
export type ContractIngestLock = z.infer<typeof contractIngestLockSchema>;

export type ContractBundle = {
  manifest: ContractManifest;
  fixture: ContractFixture;
  lock: ContractIngestLock;
  manifestSha256: string;
};

export type ContractDiffItem = {
  entity:
    "schema" | "diagnostic" | "catalog" | "capability" | "graph" | "variant";
  id: string;
  kind?: string;
};

export type ContractDiff = {
  from: string;
  to: string;
  added: ContractDiffItem[];
  removed: ContractDiffItem[];
  changed: ContractDiffItem[];
};

export type ContractErrorCode =
  | "ContractVersionNotFound"
  | "ContractEntityNotFound"
  | "ContractEntityDeprecated"
  | "ContractVersionConflict"
  | "ContractIdentifierConflict"
  | "ContractDatasetUnavailable";

export class ContractDataError extends Error {
  constructor(
    readonly code: ContractErrorCode,
    message: string,
    readonly statusCode: 404 | 409 | 410 | 503,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ContractDataError";
  }
}

export type ContractDataService = {
  listVersions(): Promise<ContractSummary[]>;
  getContract(version: string): Promise<ContractSummary>;
  listDiagnostics(version: string): Promise<DiagnosticRecord[]>;
  getDiagnostic(version: string, code: string): Promise<DiagnosticRecord>;
  listCatalog(version: string, kind?: CatalogKind): Promise<CatalogRecord[]>;
  getCatalog(
    version: string,
    id: string,
    kind?: CatalogKind,
  ): Promise<CatalogRecord>;
  listCapabilities(version: string): Promise<CapabilityRecord[]>;
  getCapability(version: string, id: string): Promise<CapabilityRecord>;
  getGraph(version: string): Promise<GraphRecord>;
  getVariant(version: string): Promise<VariantRecord>;
  diff(from: string, to: string): Promise<ContractDiff>;
};

function assertUsable<
  T extends { id: string; status: ContractStatus; deprecation: Deprecation },
>(record: T): T {
  if (record.status === "deprecated" || record.deprecation) {
    throw new ContractDataError(
      "ContractEntityDeprecated",
      `${record.id} is deprecated in this contract version.`,
      410,
      { id: record.id, deprecation: record.deprecation },
    );
  }
  return record;
}

function diffRecords(fixture: ContractFixture): Map<string, unknown> {
  const records = new Map<string, unknown>();
  fixture.schemas.forEach((entry) => records.set(`schema:${entry.id}`, entry));
  fixture.diagnostics.forEach((entry) =>
    records.set(`diagnostic:${entry.code}`, entry),
  );
  fixture.catalog.forEach((entry) =>
    records.set(`catalog:${entry.kind}:${entry.id}`, entry),
  );
  fixture.capabilities.forEach((entry) =>
    records.set(`capability:${entry.id}`, entry),
  );
  records.set(`graph:${fixture.graph.id}`, fixture.graph);
  records.set(`variant:${fixture.variant.id}`, fixture.variant);
  return records;
}

function diffItem(key: string): ContractDiffItem {
  const [entity, first, ...rest] = key.split(":");
  if (entity === "catalog") {
    return { entity, kind: first, id: rest.join(":") };
  }
  return {
    entity: entity as ContractDiffItem["entity"],
    id: [first, ...rest].join(":"),
  };
}

export function createContractDataService(
  fixtures: ContractFixture[],
): ContractDataService {
  const versions = new Map(
    fixtures.map((fixture) => [fixture.contract.version, fixture]),
  );
  const requireVersion = (version: string) => {
    const fixture = versions.get(version);
    if (!fixture) {
      throw new ContractDataError(
        "ContractVersionNotFound",
        `Contract version ${version} does not exist.`,
        404,
        { version, availableVersions: [...versions.keys()] },
      );
    }
    return fixture;
  };
  const conflictFor = (
    version: string,
    predicate: (fixture: ContractFixture) => boolean,
  ) => {
    const foundIn = fixtures
      .filter(
        (fixture) => fixture.contract.version !== version && predicate(fixture),
      )
      .map((fixture) => fixture.contract.version);
    if (foundIn.length > 0) {
      throw new ContractDataError(
        "ContractVersionConflict",
        "The requested identifier exists, but not in the requested contract version.",
        409,
        { requestedVersion: version, foundIn },
      );
    }
  };

  return {
    async listVersions() {
      return fixtures.map((fixture) => fixture.contract);
    },
    async getContract(version) {
      return requireVersion(version).contract;
    },
    async listDiagnostics(version) {
      return requireVersion(version).diagnostics;
    },
    async getDiagnostic(version, code) {
      const fixture = requireVersion(version);
      const entry = fixture.diagnostics.find(
        (item) => item.code === code || item.id === code,
      );
      if (!entry) {
        conflictFor(version, (candidate) =>
          candidate.diagnostics.some(
            (item) => item.code === code || item.id === code,
          ),
        );
        throw new ContractDataError(
          "ContractEntityNotFound",
          `Diagnostic ${code} does not exist in ${version}.`,
          404,
          { version, code },
        );
      }
      return assertUsable(entry);
    },
    async listCatalog(version, kind) {
      const entries = requireVersion(version).catalog;
      return kind ? entries.filter((entry) => entry.kind === kind) : entries;
    },
    async getCatalog(version, id, kind) {
      const fixture = requireVersion(version);
      const matches = fixture.catalog.filter(
        (entry) => entry.id === id && (!kind || entry.kind === kind),
      );
      if (matches.length > 1) {
        throw new ContractDataError(
          "ContractIdentifierConflict",
          `Catalog ID ${id} is present in more than one catalog kind.`,
          409,
          { id, kinds: matches.map((entry) => entry.kind) },
        );
      }
      if (!matches[0]) {
        conflictFor(version, (candidate) =>
          candidate.catalog.some(
            (entry) => entry.id === id && (!kind || entry.kind === kind),
          ),
        );
        throw new ContractDataError(
          "ContractEntityNotFound",
          `Catalog ID ${id} does not exist in ${version}.`,
          404,
          { version, id, kind },
        );
      }
      return assertUsable(matches[0]);
    },
    async listCapabilities(version) {
      return requireVersion(version).capabilities;
    },
    async getCapability(version, id) {
      const fixture = requireVersion(version);
      const entry = fixture.capabilities.find((item) => item.id === id);
      if (!entry) {
        conflictFor(version, (candidate) =>
          candidate.capabilities.some((item) => item.id === id),
        );
        throw new ContractDataError(
          "ContractEntityNotFound",
          `Capability ${id} does not exist in ${version}.`,
          404,
          { version, id },
        );
      }
      return assertUsable(entry);
    },
    async getGraph(version) {
      return requireVersion(version).graph;
    },
    async getVariant(version) {
      return requireVersion(version).variant;
    },
    async diff(from, to) {
      const fromRecords = diffRecords(requireVersion(from));
      const toRecords = diffRecords(requireVersion(to));
      const added = [...toRecords.keys()].filter(
        (key) => !fromRecords.has(key),
      );
      const removed = [...fromRecords.keys()].filter(
        (key) => !toRecords.has(key),
      );
      const changed = [...toRecords.keys()].filter(
        (key) =>
          fromRecords.has(key) &&
          JSON.stringify(fromRecords.get(key)) !==
            JSON.stringify(toRecords.get(key)),
      );
      return {
        from,
        to,
        added: added.map(diffItem),
        removed: removed.map(diffItem),
        changed: changed.map(diffItem),
      };
    },
  };
}
