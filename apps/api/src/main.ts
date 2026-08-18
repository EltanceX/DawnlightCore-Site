import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseServerEnv, formatEnvIssues } from "@dawnlight/config";
import {
  closeDatabase,
  createPostgresAuthoringDataService,
  createDatabasePool,
  createPostgresContractDataService,
  createPostgresUploadDataService,
  createPostgresPublishingDataService,
  createPostgresDirectoryDataService,
} from "@dawnlight/database";
import {
  createContractDataService,
  createDirectoryDataService,
  type ContractDataService,
} from "@dawnlight/contract-data";
import { loadContractBundle } from "@dawnlight/contract-data/node";
import { createApp } from "./app.js";
import { createOidcClient } from "./oidc.js";
import { createQuarantineStorage } from "./storage.js";
import { createPreflightQueue } from "./queue.js";
import type { PreflightQueue } from "./queue.js";

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
const quarantine = createQuarantineStorage(env);
const uploads = createPostgresUploadDataService(database);
let preflightQueue: PreflightQueue;
let stopPreflightQueue = async () => {};
try {
  const managedQueue = await createPreflightQueue(
    env.DATABASE_URL,
    env.PREFLIGHT_RETRY_LIMIT,
    env.PREFLIGHT_TIMEOUT_SECONDS,
  );
  preflightQueue = managedQueue;
  stopPreflightQueue = managedQueue.stop;
  for (const uploadId of await uploads.listPendingPreflightUploads()) {
    try {
      await preflightQueue.enqueue(uploadId);
      await uploads.markPreflightDispatched(uploadId);
    } catch {
      // The outbox remains pending and will be retried on the next boot/complete.
    }
  }
} catch (error) {
  console.warn(
    "Preflight queue unavailable; API will keep the outbox pending.",
    error,
  );
  preflightQueue = {
    async enqueue() {
      throw new Error("preflight queue unavailable");
    },
  };
}
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
  checkObjectStorage: quarantine.check,
  authoring: createPostgresAuthoringDataService(database),
  uploads,
  publishing: createPostgresPublishingDataService(database),
  quarantine,
  preflightQueue,
  oidc: env.OIDC_ENABLED
    ? createOidcClient({
        issuerUrl: env.OIDC_ISSUER_URL,
        clientId: env.OIDC_CLIENT_ID,
        clientSecret: env.OIDC_CLIENT_SECRET,
        redirectUri: env.OIDC_REDIRECT_URI,
      })
    : undefined,
  contracts,
  directory:
    env.CONTRACT_DATA_SOURCE === "database"
      ? createPostgresDirectoryDataService(database)
      : createDirectoryDataService(
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
  await stopPreflightQueue();
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
