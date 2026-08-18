import { PgBoss } from "pg-boss";
import {
  preflightDeadLetterQueueName,
  preflightQueueName,
  quarantineCleanupQueueName,
} from "@dawnlight/database";

export const validationQueueName = "dawnlight.validation.v1" as const;

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
}
