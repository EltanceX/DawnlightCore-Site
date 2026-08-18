import { parseServerEnv, formatEnvIssues } from "@dawnlight/config";
import { closeDatabase, createDatabasePool } from "@dawnlight/database";
import { createApp } from "./app.js";

let env;
try {
  env = parseServerEnv();
} catch (error) {
  console.error(
    `Invalid server environment:\n${formatEnvIssues(error as never)}`,
  );
  process.exit(1);
}

const database = createDatabasePool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
});
const app = await createApp(env, { database });

const close = async () => {
  await app.close();
  await closeDatabase(database);
};
process.once("SIGINT", close);
process.once("SIGTERM", close);

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(
    { host: env.API_HOST, port: env.API_PORT },
    "Dawnlight API listening",
  );
} catch (error) {
  app.log.error({ err: error }, "Dawnlight API failed to start");
  await close();
  process.exit(1);
}
