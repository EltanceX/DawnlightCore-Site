import { PgBoss } from "pg-boss";
import {
  preflightDeadLetterQueueName,
  preflightQueueName,
  quarantineCleanupQueueName,
  loaderValidationQueueName,
  loaderValidationDeadLetterQueueName,
  publicationQueueName,
  publicationDeadLetterQueueName,
  downloadRetentionQueueName,
} from "@dawnlight/database";

export const validationQueueName = "dawnlight.validation.v1" as const;
export const workflowDispatchQueueName =
  "dawnlight.workflow-dispatch.v1" as const;

export function createQueue(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    application_name: "dawnlight-worker",
  });
}

export async function configureQueues(
  boss: PgBoss,
  retryLimit: number,
  timeoutSeconds: number,
  loaderRetryLimit: number,
  loaderTimeoutSeconds: number,
  publicationRetryLimit: number,
  publicationTimeoutSeconds: number,
) {
  await boss.createQueue(preflightDeadLetterQueueName, {
    retryLimit: 0,
    deleteAfterSeconds: 2_592_000,
  });
  await boss.createQueue(preflightQueueName, {
    retryLimit,
    retryDelay: 2,
    retryBackoff: true,
    expireInSeconds: timeoutSeconds,
    deadLetter: preflightDeadLetterQueueName,
    policy: "key_strict_fifo",
  });
  await boss.createQueue(quarantineCleanupQueueName, {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 300,
  });
  await boss.createQueue(loaderValidationDeadLetterQueueName, {
    retryLimit: 0,
    deleteAfterSeconds: 2_592_000,
  });
  await boss.createQueue(loaderValidationQueueName, {
    retryLimit: loaderRetryLimit,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: loaderTimeoutSeconds + 30,
    deadLetter: loaderValidationDeadLetterQueueName,
    policy: "key_strict_fifo",
  });
  await boss.createQueue(publicationDeadLetterQueueName, {
    retryLimit: 0,
    deleteAfterSeconds: 2_592_000,
  });
  await boss.createQueue(publicationQueueName, {
    retryLimit: publicationRetryLimit,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: publicationTimeoutSeconds,
    deadLetter: publicationDeadLetterQueueName,
    policy: "key_strict_fifo",
  });
  await boss.createQueue(workflowDispatchQueueName, {
    retryLimit: 3,
    retryDelay: 5,
    expireInSeconds: 120,
  });
  await boss.createQueue(downloadRetentionQueueName, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
  });
}
