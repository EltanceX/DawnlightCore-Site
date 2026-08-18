import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2";
const migrationsRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);
const files = (await readdir(migrationsRoot))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const client = new Client({ connectionString });

await client.connect();
try {
  await client.query("begin");
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const existing = await client.query(
      "select 1 from schema_migrations where version = $1",
      [version],
    );
    if (existing.rowCount) continue;
    await client.query(readFileSync(resolve(migrationsRoot, file), "utf8"));
    await client.query("insert into schema_migrations (version) values ($1)", [
      version,
    ]);
    console.log(`Applied ${version}`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
