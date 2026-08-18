import { PgBoss } from "pg-boss";

export const validationQueueName = "dawnlight.validation.v1" as const;

export function createQueue(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    application_name: "dawnlight-worker",
  });
}
