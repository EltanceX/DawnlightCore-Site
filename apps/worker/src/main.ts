import pino from "pino";
import { parseServerEnv } from "@dawnlight/config";
import { createQueue, validationQueueName } from "./queue.js";

const env = parseServerEnv();
const logger = pino({ level: env.LOG_LEVEL });
const boss = createQueue(env.DATABASE_URL);

await boss.start();
await boss.createQueue(validationQueueName);
logger.info({ queue: validationQueueName }, "Dawnlight worker queue ready");

const close = async () => {
  await boss.stop();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
