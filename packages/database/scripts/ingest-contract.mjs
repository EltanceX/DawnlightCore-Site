import { resolve } from "node:path";
import { createDatabasePool, ingestContractBundle } from "../dist/index.js";
import { loadContractBundle } from "@dawnlight/contract-data/node";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2";
const contractRoot = resolve(
  process.env.DAWNLIGHT_CONTRACT_ROOT ?? "contracts/dawnlight/preview",
);
const requireSignature = process.env.APP_ENV === "production";
const pool = createDatabasePool({ connectionString });

try {
  const bundle = loadContractBundle(contractRoot, { requireSignature });
  const result = await ingestContractBundle(pool, bundle);
  console.log(
    `Contract ingest ${result.status}: ${result.version} (${JSON.stringify(result.rowCounts)}).`,
  );
} finally {
  await pool.end();
}
