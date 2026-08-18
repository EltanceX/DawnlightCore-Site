import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2";
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `
    insert into runtime_instances (id, service, environment, metadata)
    values (gen_random_uuid(), 'seed', $1, $2::jsonb)
  `,
    [
      process.env.APP_ENV ?? "development",
      JSON.stringify({ source: "wp1-seed" }),
    ],
  );
  console.log("Seeded V2 runtime fixture.");
} finally {
  await client.end();
}
