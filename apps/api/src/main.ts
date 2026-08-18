import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseServerEnv, formatEnvIssues } from "@dawnlight/config";
import {
  closeDatabase,
  createPostgresAuthoringDataService,
  createDatabasePool,
  createPostgresContractDataService,
} from "@dawnlight/database";
import {
  createContractDataService,
  createDirectoryDataService,
  type ContractDataService,
} from "@dawnlight/contract-data";
import { loadContractBundle } from "@dawnlight/contract-data/node";
import { createApp } from "./app.js";
import { createOidcClient } from "./oidc.js";

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
let contracts: ContractDataService;
if (env.CONTRACT_DATA_SOURCE === "database") {
  contracts = await createPostgresContractDataService(database);
} else {
  const bundle = loadContractBundle(env.CONTRACT_FIXTURE_ROOT, {
    requireSignature: env.APP_ENV === "production",
  });
  contracts = createContractDataService([bundle.fixture]);
}
const app = await createApp(env, {
  database,
  authoring: createPostgresAuthoringDataService(database),
  oidc: env.OIDC_ENABLED
    ? createOidcClient({
        issuerUrl: env.OIDC_ISSUER_URL,
        clientId: env.OIDC_CLIENT_ID,
        clientSecret: env.OIDC_CLIENT_SECRET,
        redirectUri: env.OIDC_REDIRECT_URI,
      })
    : undefined,
  contracts,
  directory: createDirectoryDataService(
    JSON.parse(
      readFileSync(
        resolve(env.CONTRACT_FIXTURE_ROOT, "directory-fixture.json"),
        "utf8",
      ),
    ),
  ),
});

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
