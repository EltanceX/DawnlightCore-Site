import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean().optional());

const optionalDigestFromEnv = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^.+@sha256:[0-9a-f]{64}$/)
    .optional(),
);

export const serverEnvSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]),
    API_HOST: z.string().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100),
    CONTRACT_DATA_SOURCE: z.enum(["fixture", "database"]),
    CONTRACT_FIXTURE_ROOT: z.string().min(1),
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
    OIDC_ENABLED: booleanFromEnv,
    OIDC_ISSUER_URL: z.string().url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_REDIRECT_URI: z.string().url(),
    OIDC_WEB_RETURN_ORIGIN: z.string().url(),
    AUTH_COOKIE_SECRET: z.string().min(32),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000),
    AUTH_LOGIN_TTL_SECONDS: z.coerce.number().int().min(60).max(1800),
    UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600),
    UPLOAD_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86400),
    UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(536870912),
    PREFLIGHT_MAX_EXTRACTED_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(2147483648),
    PREFLIGHT_MAX_FILES: z.coerce.number().int().min(1).max(20000),
    PREFLIGHT_MAX_JSON_BYTES: z.coerce.number().int().min(1024).max(16777216),
    PREFLIGHT_MAX_IMAGE_BYTES: z.coerce.number().int().min(1024).max(67108864),
    PREFLIGHT_MAX_IMAGE_PIXELS: z.coerce.number().int().min(1).max(268435456),
    PREFLIGHT_MAX_COMPRESSION_RATIO: z.coerce.number().min(1).max(1000),
    PREFLIGHT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(1800),
    PREFLIGHT_RETRY_LIMIT: z.coerce.number().int().min(0).max(10),
    QUARANTINE_FAILED_RETENTION_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(2592000),
    LOADER_VALIDATOR_ENABLED: booleanFromEnv,
    LOADER_VALIDATOR_IMAGE: optionalDigestFromEnv,
    LOADER_CLI_VERSION: z.string().min(1).max(120),
    LOADER_CORE_COMMIT: z.string().regex(/^[0-9a-f]{40}$/),
    LOADER_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(1800),
    LOADER_RETRY_LIMIT: z.coerce.number().int().min(0).max(5),
    LOADER_MEMORY_MB: z.coerce.number().int().min(128).max(4096),
    LOADER_CPU_LIMIT: z.coerce.number().min(0.1).max(8),
    PUBLICATION_RETRY_LIMIT: z.coerce.number().int().min(0).max(10),
    PUBLICATION_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600),
    RATE_LIMIT_SEARCH_PER_MINUTE: z.coerce.number().int().min(1).max(10000),
    RATE_LIMIT_DOWNLOAD_PER_MINUTE: z.coerce.number().int().min(1).max(10000),
    RATE_LIMIT_UPLOAD_PER_MINUTE: z.coerce.number().int().min(1).max(1000),
    RATE_LIMIT_LOGIN_PER_TEN_MINUTES: z.coerce.number().int().min(1).max(1000),
    RATE_LIMIT_REPORT_PER_HOUR: z.coerce.number().int().min(1).max(1000),
    DOWNLOAD_EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650),
    PUBLISHED_PUBLIC_BASE_URL: z.string().url(),
    RELEASE_FEED_SIGNING_KEY_ID: z.string().min(1).max(120),
    RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64: z.string().min(1).optional(),
  })
  .superRefine((env, context) => {
    if (env.LOADER_VALIDATOR_ENABLED && !env.LOADER_VALIDATOR_IMAGE) {
      context.addIssue({
        code: "custom",
        path: ["LOADER_VALIDATOR_IMAGE"],
        message:
          "a digest-pinned validator image is required when Loader validation is enabled",
      });
    }
    if (
      (env.APP_ENV === "staging" || env.APP_ENV === "production") &&
      !env.RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64
    ) {
      context.addIssue({
        code: "custom",
        path: ["RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64"],
        message:
          "a release feed signing key is required outside development/test",
      });
    }
    if (
      env.APP_ENV === "production" &&
      !env.PUBLISHED_PUBLIC_BASE_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["PUBLISHED_PUBLIC_BASE_URL"],
        message: "production published artifacts require HTTPS",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const defaults = {
  APP_ENV: "development",
  API_HOST: "127.0.0.1",
  API_PORT: "4100",
  DATABASE_URL: "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2",
  DATABASE_POOL_MAX: "5",
  CONTRACT_DATA_SOURCE: "fixture",
  CONTRACT_FIXTURE_ROOT: "contracts/dawnlight/preview",
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
  OIDC_ENABLED: "false",
  OIDC_ISSUER_URL: "https://oidc.example.invalid",
  OIDC_CLIENT_ID: "dawnlight-disabled",
  OIDC_CLIENT_SECRET: "dawnlight-disabled",
  OIDC_REDIRECT_URI: "http://127.0.0.1:4100/api/v1/auth/oidc/callback",
  OIDC_WEB_RETURN_ORIGIN: "http://127.0.0.1:3000",
  AUTH_COOKIE_SECRET: "dawnlight-local-cookie-key-change-before-use",
  AUTH_SESSION_TTL_SECONDS: "28800",
  AUTH_LOGIN_TTL_SECONDS: "600",
  UPLOAD_URL_TTL_SECONDS: "900",
  UPLOAD_SESSION_TTL_SECONDS: "3600",
  UPLOAD_MAX_BYTES: "536870912",
  PREFLIGHT_MAX_EXTRACTED_BYTES: "805306368",
  PREFLIGHT_MAX_FILES: "4096",
  PREFLIGHT_MAX_JSON_BYTES: "2097152",
  PREFLIGHT_MAX_IMAGE_BYTES: "16777216",
  PREFLIGHT_MAX_IMAGE_PIXELS: "67108864",
  PREFLIGHT_MAX_COMPRESSION_RATIO: "200",
  PREFLIGHT_TIMEOUT_SECONDS: "120",
  PREFLIGHT_RETRY_LIMIT: "2",
  QUARANTINE_FAILED_RETENTION_SECONDS: "86400",
  LOADER_VALIDATOR_ENABLED: "false",
  LOADER_CLI_VERSION: "ShaderPackCli/de780e8",
  LOADER_CORE_COMMIT: "de780e826a1a8537cf120600caf68e9d890737ac",
  LOADER_TIMEOUT_SECONDS: "120",
  LOADER_RETRY_LIMIT: "1",
  LOADER_MEMORY_MB: "768",
  LOADER_CPU_LIMIT: "1",
  PUBLICATION_RETRY_LIMIT: "3",
  PUBLICATION_TIMEOUT_SECONDS: "600",
  RATE_LIMIT_SEARCH_PER_MINUTE: "60",
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: "30",
  RATE_LIMIT_UPLOAD_PER_MINUTE: "10",
  RATE_LIMIT_LOGIN_PER_TEN_MINUTES: "10",
  RATE_LIMIT_REPORT_PER_HOUR: "5",
  DOWNLOAD_EVENT_RETENTION_DAYS: "90",
  PUBLISHED_PUBLIC_BASE_URL: "http://127.0.0.1:59000/dawnlight-published",
  RELEASE_FEED_SIGNING_KEY_ID: "development-unconfigured",
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
