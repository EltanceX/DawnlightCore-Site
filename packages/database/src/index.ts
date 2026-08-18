import { Pool, type PoolConfig } from "pg";

export type DatabasePoolOptions = PoolConfig & { connectionString: string };

export function createDatabasePool(options: DatabasePoolOptions): Pool {
  return new Pool(options);
}

export async function checkDatabase(pool: Pool): Promise<void> {
  await pool.query("select 1 as ok");
}

export async function closeDatabase(pool: Pool): Promise<void> {
  await pool.end();
}

export {
  createPostgresContractDataService,
  ingestContractBundle,
  type ContractIngestResult,
} from "./contracts.js";
