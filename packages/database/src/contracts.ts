import type { Pool, PoolClient } from "pg";
import {
  ContractDataError,
  createContractDataService,
  type ContractBundle,
  type ContractDataService,
  type ContractFixture,
} from "@dawnlight/contract-data";

export type ContractIngestResult = {
  status: "activated" | "unchanged";
  version: string;
  previousActiveVersion: string | null;
  rowCounts: Record<string, number>;
};

const json = (value: unknown) => JSON.stringify(value);

async function insertFixture(
  client: PoolClient,
  bundle: ContractBundle,
): Promise<void> {
  const { fixture, manifest, manifestSha256 } = bundle;
  const contract = fixture.contract;
  await client.query(
    `insert into contract_versions (
      version, contract_id, status, public_api_status, source_repository,
      source_commit, game_api_tag, manifest_versions, settings_schema_versions,
      captured_at, content_digest, manifest_sha256, signature_status, signature_key_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      contract.version,
      contract.id,
      contract.status,
      contract.publicApiStatus,
      contract.sourceRepository,
      contract.sourceCommit,
      contract.gameApiTag,
      contract.manifestVersions,
      contract.settingsSchemaVersions,
      contract.capturedAt,
      contract.contentDigest,
      manifestSha256,
      manifest.signature.status,
      manifest.signature.keyId,
    ],
  );

  for (const entry of fixture.schemas) {
    await client.query(
      `insert into contract_schemas
        (contract_version, entry_id, entry_version, status, source_ref, deprecation, document)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [
        contract.version,
        entry.id,
        entry.version,
        entry.status,
        json(entry.sourceRef),
        json(entry.deprecation),
        json(entry.document),
      ],
    );
  }
  for (const entry of fixture.diagnostics) {
    await client.query(
      `insert into contract_diagnostics
        (contract_version, entry_id, code, entry_version, status, diagnostic_group,
         severities, catalog_kinds, source_ref, deprecation)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
      [
        contract.version,
        entry.id,
        entry.code,
        entry.version,
        entry.status,
        entry.group,
        entry.severities,
        entry.catalogKinds,
        json(entry.sourceRef),
        json(entry.deprecation),
      ],
    );
  }
  for (const entry of fixture.catalog) {
    await client.query(
      `insert into contract_catalog_entries
        (contract_version, entry_id, catalog_kind, entry_version, status, source_ref, deprecation)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [
        contract.version,
        entry.id,
        entry.kind,
        entry.version,
        entry.status,
        json(entry.sourceRef),
        json(entry.deprecation),
      ],
    );
  }
  for (const entry of fixture.capabilities) {
    await client.query(
      `insert into contract_capabilities
        (contract_version, entry_id, entry_version, status, source_ref, deprecation)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [
        contract.version,
        entry.id,
        entry.version,
        entry.status,
        json(entry.sourceRef),
        json(entry.deprecation),
      ],
    );
  }
  await client.query(
    `insert into contract_graphs
      (contract_version, entry_id, entry_version, status, source_ref, deprecation, reason, nodes, edges)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9::jsonb)`,
    [
      contract.version,
      fixture.graph.id,
      fixture.graph.version,
      fixture.graph.status,
      json(fixture.graph.sourceRef),
      json(fixture.graph.deprecation),
      fixture.graph.reason,
      json(fixture.graph.nodes),
      json(fixture.graph.edges),
    ],
  );
  await client.query(
    `insert into contract_variants
      (contract_version, entry_id, entry_version, status, source_ref, deprecation, reason, explanations)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb)`,
    [
      contract.version,
      fixture.variant.id,
      fixture.variant.version,
      fixture.variant.status,
      json(fixture.variant.sourceRef),
      json(fixture.variant.deprecation),
      fixture.variant.reason,
      json(fixture.variant.explanations),
    ],
  );
}

export async function ingestContractBundle(
  pool: Pool,
  bundle: ContractBundle,
): Promise<ContractIngestResult> {
  const client = await pool.connect();
  const version = bundle.fixture.contract.version;
  const rowCounts = bundle.lock.expectedRows;
  try {
    await client.query("begin");
    await client.query(
      "select pg_advisory_xact_lock(hashtext('dawnlight-contract-ingest'))",
    );
    const active = await client.query<{ version: string }>(
      "select version from contract_versions where is_active = true for update",
    );
    const previousActiveVersion = active.rows[0]?.version ?? null;
    const existing = await client.query<{ manifest_sha256: string }>(
      "select manifest_sha256 from contract_versions where version = $1",
      [version],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].manifest_sha256 !== bundle.manifestSha256) {
        throw new ContractDataError(
          "ContractVersionConflict",
          `Contract ${version} already exists with a different manifest digest.`,
          409,
          { version },
        );
      }
      if (previousActiveVersion !== version) {
        await client.query(
          "update contract_versions set is_active = false where is_active = true",
        );
        await client.query(
          "update contract_versions set is_active = true, activated_at = now() where version = $1",
          [version],
        );
      }
      await client.query(
        `insert into contract_ingest_runs
          (contract_version, manifest_sha256, status, row_counts, completed_at)
         values ($1,$2,'unchanged',$3::jsonb,now())`,
        [version, bundle.manifestSha256, json(rowCounts)],
      );
      await client.query("commit");
      return { status: "unchanged", version, previousActiveVersion, rowCounts };
    }

    await insertFixture(client, bundle);
    await client.query(
      "update contract_versions set is_active = false where is_active = true",
    );
    await client.query(
      "update contract_versions set is_active = true, activated_at = now() where version = $1",
      [version],
    );
    await client.query(
      `insert into contract_ingest_runs
        (contract_version, manifest_sha256, status, row_counts, completed_at)
       values ($1,$2,'activated',$3::jsonb,now())`,
      [version, bundle.manifestSha256, json(rowCounts)],
    );
    await client.query("commit");
    return { status: "activated", version, previousActiveVersion, rowCounts };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

type VersionRow = {
  version: string;
  contract_id: string;
  status: ContractFixture["contract"]["status"];
  public_api_status: ContractFixture["contract"]["publicApiStatus"];
  source_repository: string;
  source_commit: string;
  game_api_tag: string;
  manifest_versions: number[];
  settings_schema_versions: number[];
  captured_at: Date;
  content_digest: string;
};

export async function createPostgresContractDataService(
  pool: Pool,
): Promise<ContractDataService> {
  const versions = await pool.query<VersionRow>(
    "select * from contract_versions order by captured_at",
  );
  const fixtures: ContractFixture[] = [];
  for (const row of versions.rows) {
    const [schemas, diagnostics, catalog, capabilities, graph, variant] =
      await Promise.all([
        pool.query(
          "select * from contract_schemas where contract_version = $1 order by entry_id",
          [row.version],
        ),
        pool.query(
          "select * from contract_diagnostics where contract_version = $1 order by code",
          [row.version],
        ),
        pool.query(
          "select * from contract_catalog_entries where contract_version = $1 order by catalog_kind, entry_id",
          [row.version],
        ),
        pool.query(
          "select * from contract_capabilities where contract_version = $1 order by entry_id",
          [row.version],
        ),
        pool.query(
          "select * from contract_graphs where contract_version = $1",
          [row.version],
        ),
        pool.query(
          "select * from contract_variants where contract_version = $1",
          [row.version],
        ),
      ]);
    if (!graph.rows[0] || !variant.rows[0]) {
      throw new Error(
        `Contract ${row.version} is incomplete and cannot be activated.`,
      );
    }
    fixtures.push({
      fixtureVersion: 1,
      contract: {
        id: row.contract_id,
        version: row.version,
        status: row.status,
        publicApiStatus: row.public_api_status,
        sourceRepository: row.source_repository,
        sourceCommit: row.source_commit,
        gameApiTag: row.game_api_tag,
        manifestVersions: row.manifest_versions,
        settingsSchemaVersions: row.settings_schema_versions,
        capturedAt: row.captured_at.toISOString(),
        contentDigest: row.content_digest,
      },
      schemas: schemas.rows.map((entry) => ({
        id: entry.entry_id,
        version: entry.entry_version,
        status: entry.status,
        sourceRef: entry.source_ref,
        deprecation: entry.deprecation,
        document: entry.document,
      })),
      diagnostics: diagnostics.rows.map((entry) => ({
        id: entry.entry_id,
        code: entry.code,
        version: entry.entry_version,
        status: entry.status,
        group: entry.diagnostic_group,
        severities: entry.severities,
        catalogKinds: entry.catalog_kinds,
        sourceRef: entry.source_ref,
        deprecation: entry.deprecation,
      })),
      catalog: catalog.rows.map((entry) => ({
        id: entry.entry_id,
        kind: entry.catalog_kind,
        version: entry.entry_version,
        status: entry.status,
        sourceRef: entry.source_ref,
        deprecation: entry.deprecation,
      })),
      capabilities: capabilities.rows.map((entry) => ({
        id: entry.entry_id,
        version: entry.entry_version,
        status: entry.status,
        sourceRef: entry.source_ref,
        deprecation: entry.deprecation,
      })),
      graph: {
        id: graph.rows[0].entry_id,
        version: graph.rows[0].entry_version,
        status: graph.rows[0].status,
        sourceRef: graph.rows[0].source_ref,
        deprecation: graph.rows[0].deprecation,
        reason: graph.rows[0].reason,
        nodes: graph.rows[0].nodes,
        edges: graph.rows[0].edges,
      },
      variant: {
        id: variant.rows[0].entry_id,
        version: variant.rows[0].entry_version,
        status: variant.rows[0].status,
        sourceRef: variant.rows[0].source_ref,
        deprecation: variant.rows[0].deprecation,
        reason: variant.rows[0].reason,
        explanations: variant.rows[0].explanations,
      },
    });
  }
  return createContractDataService(fixtures);
}
