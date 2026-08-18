import { formatEnvIssues, parseServerEnv } from "@dawnlight/config";

try {
  const env = parseServerEnv();
  console.log(
    JSON.stringify({
      status: "ok",
      service: "dawnlight-worker",
      environment: env.APP_ENV,
      queue: "dawnlight.validation.v1",
      database: "configured",
      objectStorage: "configured",
    }),
  );
} catch (error) {
  console.error(
    `Invalid worker environment:\n${formatEnvIssues(error as never)}`,
  );
  process.exit(1);
}
