import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean().optional());

export const serverEnvSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]),
  API_HOST: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  OBJECT_STORAGE_BUCKET_QUARANTINE: z.string().min(1),
  OBJECT_STORAGE_BUCKET_PUBLISHED: z.string().min(1),
  OBJECT_STORAGE_BUCKET_DERIVED: z.string().min(1),
  CORS_ORIGIN: z.string().url(),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
  TRUST_PROXY: booleanFromEnv,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const defaults = {
  APP_ENV: "development",
  API_HOST: "127.0.0.1",
  API_PORT: "4100",
  DATABASE_URL: "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2",
  DATABASE_POOL_MAX: "5",
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:59000",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_ACCESS_KEY: "dawnlight-local",
  OBJECT_STORAGE_SECRET_KEY: "dawnlight-local-secret",
  OBJECT_STORAGE_BUCKET_QUARANTINE: "dawnlight-quarantine",
  OBJECT_STORAGE_BUCKET_PUBLISHED: "dawnlight-published",
  OBJECT_STORAGE_BUCKET_DERIVED: "dawnlight-derived",
  CORS_ORIGIN: "http://127.0.0.1:3000",
  OTEL_SERVICE_NAME: "dawnlight-api",
  LOG_LEVEL: "info",
  TRUST_PROXY: "false",
} as const;

export function parseServerEnv(
  input: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  return serverEnvSchema.parse({ ...defaults, ...input });
}

export function formatEnvIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
}
