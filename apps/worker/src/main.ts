import pino from "pino";
import { parseServerEnv } from "@dawnlight/config";
import {
  createDatabasePool,
  createPostgresUploadDataService,
  preflightQueueName,
  quarantineCleanupQueueName,
} from "@dawnlight/database";
import type { JobWithMetadata } from "pg-boss";
import { createQueue, configureQueues } from "./queue.js";
import { createWorkerQuarantineStorage } from "./storage.js";
import { PreflightRejected, runPreflight } from "./preflight.js";

const env = parseServerEnv();
const logger = pino({ level: env.LOG_LEVEL });
const database = createDatabasePool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
});
const uploads = createPostgresUploadDataService(database);
const storage = createWorkerQuarantineStorage(env);
const boss = createQueue(env.DATABASE_URL);

await boss.start();
await configureQueues(
  boss,
  env.PREFLIGHT_RETRY_LIMIT,
  env.PREFLIGHT_TIMEOUT_SECONDS,
);
await boss.schedule(quarantineCleanupQueueName, "*/15 * * * *", {});
for (const uploadId of await uploads.listPendingPreflightUploads()) {
  try {
    await boss.send(
      preflightQueueName,
      { uploadId },
      { singletonKey: uploadId },
    );
    await uploads.markPreflightDispatched(uploadId);
  } catch (error) {
    logger.warn(
      { error, uploadId },
      "could not dispatch preflight outbox item",
    );
  }
}

await boss.work<{ uploadId: string }>(
  preflightQueueName,
  { localConcurrency: 1, batchSize: 1, includeMetadata: true },
  async (jobs) => {
    const job = jobs[0]!;
    const attempt =
      (job as unknown as JobWithMetadata<{ uploadId: string }>).retryCount + 1;
    const uploadId = job.data.uploadId;
    try {
      const upload = await uploads.getWorkerUpload(uploadId);
      await uploads.beginPreflight(
        uploadId,
        "preflight-worker/0.1.0",
        job.id,
        attempt,
      );
      const report = await Promise.race([
        runPreflight(upload, storage, env),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("preflight timeout")),
            env.PREFLIGHT_TIMEOUT_SECONDS * 1000,
          ),
        ),
      ]);
      await uploads.completePreflight(
        uploadId,
        report,
        true,
        env.QUARANTINE_FAILED_RETENTION_SECONDS,
      );
      logger.info(
        { uploadId, fileCount: report.fileCount },
        "preflight passed",
      );
    } catch (error) {
      if (error instanceof PreflightRejected) {
        await uploads.completePreflight(
          uploadId,
          error.result,
          false,
          env.QUARANTINE_FAILED_RETENTION_SECONDS,
        );
        logger.info({ uploadId }, "preflight rejected package");
        return;
      }
      const finalAttempt = attempt > env.PREFLIGHT_RETRY_LIMIT;
      await uploads.recordInfrastructureFailure(
        uploadId,
        job.id,
        attempt,
        error instanceof Error
          ? error.message.slice(0, 120)
          : "InfrastructureError",
        finalAttempt,
        env.QUARANTINE_FAILED_RETENTION_SECONDS,
      );
      logger.warn(
        { error, uploadId, attempt, finalAttempt },
        "preflight infrastructure failure",
      );
      throw error;
    }
  },
);

await boss.work<{ uploadId?: string }>(
  quarantineCleanupQueueName,
  { localConcurrency: 1, batchSize: 1 },
  async (jobs) => {
    const job = jobs[0]!;
    const candidates = job.data.uploadId
      ? [await uploads.getWorkerUpload(job.data.uploadId)]
      : await uploads.listCleanupCandidates();
    for (const candidate of candidates) {
      await storage.delete(candidate.objectKey);
      await uploads.markUploadExpired(candidate.id);
    }
  },
);

logger.info({ queue: preflightQueueName }, "Dawnlight preflight worker ready");
const close = async () => {
  await boss.stop({ graceful: true, timeout: 10_000 });
  await database.end();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
