import { PgBoss } from "pg-boss";
import {
  preflightDeadLetterQueueName,
  preflightQueueName,
} from "@dawnlight/database";

export interface PreflightQueue {
  enqueue(uploadId: string): Promise<void>;
}

export async function createPreflightQueue(
  connectionString: string,
  retryLimit: number,
  timeoutSeconds: number,
) {
  const boss = new PgBoss({
    connectionString,
    application_name: "dawnlight-api-queue",
  });
  await boss.start();
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
  });
  return {
    async enqueue(uploadId: string) {
      await boss.send(
        preflightQueueName,
        { uploadId },
        {
          singletonKey: uploadId,
          retryLimit,
          expireInSeconds: timeoutSeconds,
          deadLetter: preflightDeadLetterQueueName,
        },
      );
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
    },
  };
}
