import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { trace } from "@opentelemetry/api";
import Fastify, { type FastifyInstance } from "fastify";
import type {
  HealthLiveResponse,
  HealthReadyResponse,
} from "@dawnlight/api-client";
import type { ServerEnv } from "@dawnlight/config";
import type { Pool } from "pg";
import {
  AuthoringError,
  checkDatabase,
  type AuthoringDataService,
} from "@dawnlight/database";
import {
  ContractDataError,
  DirectoryDataError,
  type ContractDataService,
  type DirectoryDataService,
} from "@dawnlight/contract-data";
import { registerContractRoutes } from "./contracts.js";
import { registerDirectoryRoutes } from "./directory.js";
import { registerAuthoringRoutes } from "./authoring.js";
import type { OidcClient } from "./oidc.js";
import type { QuarantineStorage } from "./storage.js";
import type { PreflightQueue } from "./queue.js";

export type ApiDependencies = {
  database?: Pool;
  checkObjectStorage?: () => Promise<void>;
  contracts?: ContractDataService;
  directory?: DirectoryDataService;
  authoring?: AuthoringDataService;
  oidc?: OidcClient;
  uploads?: import("@dawnlight/database").UploadDataService;
  quarantine?: QuarantineStorage;
  preflightQueue?: PreflightQueue;
  publishing?: import("@dawnlight/database").PublishingDataService;
};

const apiVersion = "0.1.0";

function safeError(error: unknown): { message: string } {
  return {
    message:
      error instanceof Error ? error.message : "unknown dependency error",
  };
}

function requestIdFromHeaders(
  headers: Record<string, unknown>,
): string | undefined {
  const value = headers["x-request-id"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function createApp(
  env: ServerEnv,
  dependencies: ApiDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL, redact: ["req.url"] },
    requestIdHeader: "x-request-id",
    genReqId: (request) =>
      requestIdFromHeaders(request.headers) ?? crypto.randomUUID(),
    trustProxy: env.TRUST_PROXY,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });
  await app.register(cookie, { secret: env.AUTH_COOKIE_SECRET });
  await app.register(formbody);

  app.addHook("onRequest", async (request) => {
    const span = trace.getActiveSpan();
    span?.setAttribute("http.request_id", request.id);
    request.log = request.log.child({ requestId: request.id });
  });

  app.get<{ Reply: HealthLiveResponse }>("/health/live", async () => ({
    status: "ok",
    service: "dawnlight-api",
    version: apiVersion,
    environment: env.APP_ENV,
  }));

  app.get<{ Reply: HealthReadyResponse }>(
    "/health/ready",
    async (request, reply) => {
      const checks: HealthReadyResponse["checks"] = {
        database: { status: "not-configured" },
        objectStorage: { status: "not-configured" },
      };

      if (dependencies.database) {
        try {
          await checkDatabase(dependencies.database);
          checks.database = { status: "ok" };
        } catch (error) {
          request.log.warn(
            { error: safeError(error) },
            "database readiness check failed",
          );
          checks.database = {
            status: "failed",
            detail: "database unavailable",
          };
        }
      }

      if (dependencies.checkObjectStorage) {
        try {
          await dependencies.checkObjectStorage();
          checks.objectStorage = { status: "ok" };
        } catch (error) {
          request.log.warn(
            { error: safeError(error) },
            "object storage readiness check failed",
          );
          checks.objectStorage = {
            status: "failed",
            detail: "object storage unavailable",
          };
        }
      } else if (env.OBJECT_STORAGE_ENDPOINT) {
        checks.objectStorage = {
          status: "not-configured",
          detail: "probe not wired in WP1",
        };
      }

      const ready = Object.values(checks).every(
        (check) => check.status === "ok" || check.status === "not-configured",
      );
      const response: HealthReadyResponse = {
        status: ready ? "ready" : "not-ready",
        service: "dawnlight-api",
        version: apiVersion,
        checks,
      };
      return reply.code(ready ? 200 : 503).send(response);
    },
  );

  if (dependencies.contracts) {
    registerContractRoutes(app, dependencies.contracts);
  }
  if (dependencies.directory) {
    registerDirectoryRoutes(app, dependencies.directory);
  }
  if (dependencies.authoring) {
    registerAuthoringRoutes(
      app,
      env,
      dependencies.authoring,
      dependencies.oidc,
      dependencies.uploads,
      dependencies.quarantine,
      dependencies.preflightQueue,
      dependencies.publishing,
    );
  }

  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof ContractDataError ||
      error instanceof DirectoryDataError ||
      error instanceof AuthoringError
    ) {
      request.log.info(
        { domainError: error.code, details: error.details },
        "api request rejected",
      );
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          details: error.details,
        },
      });
    }
    request.log.error({ error: safeError(error) }, "unhandled api error");
    return reply.code(500).send({
      error: {
        code: "InternalError",
        message: "服务器暂时无法完成请求。",
        requestId: request.id,
      },
    });
  });

  return app;
}
