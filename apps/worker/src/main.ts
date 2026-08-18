import pino from "pino";
import { parseServerEnv } from "@dawnlight/config";
import {
  createDatabasePool,
  createPostgresUploadDataService,
  createPostgresPublishingDataService,
  loaderValidationQueueName,
  publicationQueueName,
  preflightQueueName,
  quarantineCleanupQueueName,
} from "@dawnlight/database";
import type { JobWithMetadata } from "pg-boss";
import {
  createQueue,
  configureQueues,
  workflowDispatchQueueName,
} from "./queue.js";
import { createWorkerQuarantineStorage } from "./storage.js";
import { PreflightRejected, runPreflight } from "./preflight.js";
import { runLoaderValidation } from "./validator.js";
import { publishCandidate } from "./publication.js";

const env = parseServerEnv();
const logger = pino({ level: env.LOG_LEVEL });
const database = createDatabasePool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
});
const uploads = createPostgresUploadDataService(database);
const publishing = createPostgresPublishingDataService(database);
const storage = createWorkerQuarantineStorage(env);
const boss = createQueue(env.DATABASE_URL);

await boss.start();
await configureQueues(
  boss,
  env.PREFLIGHT_RETRY_LIMIT,
  env.PREFLIGHT_TIMEOUT_SECONDS,
  env.LOADER_RETRY_LIMIT,
  env.LOADER_TIMEOUT_SECONDS,
  env.PUBLICATION_RETRY_LIMIT,
  env.PUBLICATION_TIMEOUT_SECONDS,
);
await boss.schedule(quarantineCleanupQueueName, "*/15 * * * *", {});
await boss.schedule(workflowDispatchQueueName, "* * * * *", {});
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
for (const uploadId of await publishing.listPendingLoaderUploads()) {
  try {
    await boss.send(
      loaderValidationQueueName,
      { uploadId },
      { singletonKey: uploadId },
    );
    await publishing.markLoaderDispatched(uploadId);
  } catch (error) {
    logger.warn({ error, uploadId }, "could not dispatch Loader outbox item");
  }
}
for (const submissionId of await publishing.listPendingPublications()) {
  try {
    await boss.send(
      publicationQueueName,
      { submissionId },
      { singletonKey: submissionId },
    );
    await publishing.markPublicationDispatched(submissionId);
  } catch (error) {
    logger.warn(
      { error, submissionId },
      "could not dispatch publication outbox item",
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
      await boss.send(
        loaderValidationQueueName,
        { uploadId },
        { singletonKey: uploadId },
      );
      await publishing.markLoaderDispatched(uploadId);
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

await boss.work(
  workflowDispatchQueueName,
  { localConcurrency: 1, batchSize: 1 },
  async () => {
    for (const uploadId of await publishing.listPendingLoaderUploads()) {
      await boss.send(
        loaderValidationQueueName,
        { uploadId },
        { singletonKey: uploadId },
      );
      await publishing.markLoaderDispatched(uploadId);
    }
    for (const submissionId of await publishing.listPendingPublications()) {
      await boss.send(
        publicationQueueName,
        { submissionId },
        { singletonKey: submissionId },
      );
      await publishing.markPublicationDispatched(submissionId);
    }
  },
);

await boss.work<{ uploadId: string }>(
  loaderValidationQueueName,
  { localConcurrency: 1, batchSize: 1, includeMetadata: true },
  async (jobs) => {
    const job = jobs[0]!;
    const attempt =
      (job as unknown as JobWithMetadata<{ uploadId: string }>).retryCount + 1;
    const candidate = await publishing.getLoaderCandidate(job.data.uploadId);
    const runId = await publishing.beginLoaderValidation(
      candidate,
      env.LOADER_VALIDATOR_IMAGE ?? "unconfigured",
      env.LOADER_CLI_VERSION,
      env.LOADER_CORE_COMMIT,
      job.id,
      attempt,
    );
    try {
      const report = await runLoaderValidation(candidate, storage, env);
      await publishing.completeLoaderValidation(runId, report);
      logger.info(
        { uploadId: candidate.uploadId, status: report.status },
        "Loader validation completed",
      );
    } catch (error) {
      const finalAttempt = attempt > env.LOADER_RETRY_LIMIT;
      await publishing.completeLoaderValidation(
        runId,
        {
          status: "infrastructure-error",
          exitCode: null,
          logSummary:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Validator failed",
          sections: {
            schema: {
              status: "unavailable",
              summary: "Validator infrastructure failed.",
            },
            loader: { status: "unavailable", summary: "No Loader result." },
            security: {
              status: "passed",
              summary: "Quarantine preflight passed.",
            },
            resource: { status: "unavailable", summary: "No resource result." },
            compatibility: {
              status: "unavailable",
              summary: "No compatibility result.",
            },
          },
        },
        finalAttempt,
      );
      throw error;
    }
  },
);

await boss.work<{ submissionId: string }>(
  publicationQueueName,
  { localConcurrency: 1, batchSize: 1, includeMetadata: true },
  async (jobs) => {
    const job = jobs[0]!;
    const attempt =
      (job as unknown as JobWithMetadata<{ submissionId: string }>).retryCount +
      1;
    const submissionId = job.data.submissionId;
    const candidate = await publishing.getPublicationCandidate(submissionId);
    const runId = await publishing.markPublicationRunning(
      submissionId,
      job.id,
      attempt,
    );
    try {
      const result = await publishCandidate(candidate, storage, env);
      await publishing.completePublication(
        runId,
        candidate,
        result.artifact,
        result.feed,
      );
      logger.info(
        { submissionId, versionId: candidate.versionId },
        "reviewed artifact published",
      );
    } catch (error) {
      const finalAttempt = attempt > env.PUBLICATION_RETRY_LIMIT;
      await publishing.recordPublicationFailure(
        runId,
        error instanceof Error ? error.message : "Publication failed",
        finalAttempt,
      );
      logger.warn(
        { error, submissionId, attempt, finalAttempt },
        "reviewed artifact publication failed",
      );
      throw error;
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
