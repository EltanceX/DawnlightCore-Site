import { z } from "zod";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerEnv } from "@dawnlight/config";
import type {
  AuthoringDataService,
  OperationsDataService,
} from "@dawnlight/database";
import { AuthoringError } from "@dawnlight/database";
import { createSessionGuards } from "./guards.js";
import type { PublishedArtifactStorage } from "./storage.js";

const reportSchema = z.object({
  resourceId: z.string().min(1).max(160).nullable().default(null),
  contact: z.string().email().max(320),
  reason: z.string().min(10).max(4000),
});
const reportDecisionSchema = z.object({
  status: z.enum(["in-review", "resolved", "rejected"]),
  reason: z.string().min(3).max(4000),
});
const withdrawSchema = z.object({ reason: z.string().min(3).max(4000) });
const takedownSchema = z.object({
  category: z.enum([
    "malicious-package",
    "credential-exposure",
    "copyright",
    "legal",
    "security",
  ]),
  privateReason: z.string().min(10).max(4000),
  publicNotice: z.string().min(10).max(1000).nullable().default(null),
  confirmation: z.string().min(1).max(200),
});
const moderationSchema = z.object({
  action: z.enum(["hide", "unhide", "ban", "unban"]),
  reason: z.string().min(3).max(4000),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AuthoringError(
      "InvalidRequest",
      "运营请求数据不符合合同。",
      400,
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
        })),
      },
    );
  }
  return result.data;
}

function sourceClass(request: FastifyRequest) {
  const source = request.headers["x-dawnlight-source"];
  return source === "direct" || source === "referral" || source === "client"
    ? source
    : "unknown";
}

function edgeRegion(request: FastifyRequest) {
  const value = request.headers["x-edge-region"];
  return typeof value === "string"
    ? value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32) || "unknown"
    : "unknown";
}

function eventId(request: FastifyRequest) {
  const value = request.headers["x-download-event-id"];
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value)
    ? value
    : null;
}

export function registerOperationsRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  authoring: AuthoringDataService,
  operations: OperationsDataService,
  publishedArtifacts?: PublishedArtifactStorage,
) {
  const guards = createSessionGuards(env, authoring);

  app.get<{ Params: { artifactId: string } }>(
    "/api/v1/downloads/artifacts/:artifactId",
    async (request, reply) => {
      const resolution = await operations.resolveDownload(
        request.params.artifactId,
        {
          eventId: eventId(request),
          edgeRegion: edgeRegion(request),
          sourceClass: sourceClass(request),
        },
      );
      return reply
        .header("cache-control", "no-store")
        .header("x-content-sha256", resolution.sha256)
        .redirect(resolution.url, 302);
    },
  );

  app.post<{ Body: unknown }>("/api/v1/reports", async (request, reply) => {
    const report = await operations.createReport(
      parseBody(reportSchema, request.body),
    );
    return reply
      .header("cache-control", "no-store")
      .code(201)
      .send({ data: report });
  });

  app.get<{ Querystring: { days?: string } }>(
    "/api/v1/ops/overview",
    async (request, reply) => {
      const principal = await guards.requireSession(request);
      const days = Number(request.query.days ?? 7);
      return reply.header("cache-control", "private, no-store").send({
        data: await operations.getOverview(
          principal.user.id,
          Number.isFinite(days) ? days : 7,
        ),
      });
    },
  );

  app.get<{ Querystring: { status?: string } }>(
    "/api/v1/ops/reports",
    async (request, reply) => {
      const principal = await guards.requireSession(request);
      return reply.header("cache-control", "private, no-store").send({
        data: await operations.listReports(
          principal.user.id,
          request.query.status,
        ),
      });
    },
  );

  app.post<{ Params: { reportId: string }; Body: unknown }>(
    "/api/v1/ops/reports/:reportId/resolve",
    async (request, reply) => {
      const principal = await guards.requireMutation(request);
      const body = parseBody(reportDecisionSchema, request.body);
      const report = await operations.resolveReport(
        guards.mutationContext(request, principal),
        request.params.reportId,
        body.status,
        body.reason,
      );
      return reply.header("cache-control", "no-store").send({ data: report });
    },
  );

  app.post<{ Params: { versionId: string }; Body: unknown }>(
    "/api/v1/ops/versions/:versionId/withdraw",
    async (request, reply) => {
      const principal = await guards.requireMutation(request);
      const body = parseBody(withdrawSchema, request.body);
      await operations.withdrawVersion(
        guards.mutationContext(request, principal),
        request.params.versionId,
        body.reason,
      );
      return reply
        .header("cache-control", "no-store")
        .send({ data: { withdrawn: true } });
    },
  );

  app.post<{ Params: { versionId: string }; Body: unknown }>(
    "/api/v1/ops/versions/:versionId/takedown",
    async (request, reply) => {
      const principal = await guards.requireMutation(request);
      const body = parseBody(takedownSchema, request.body);
      if (body.confirmation !== `TAKEDOWN ${request.params.versionId}`) {
        throw new AuthoringError(
          "TakedownConfirmationRequired",
          "紧急下架必须逐字确认目标版本。",
          400,
        );
      }
      const decision = await operations.takedownVersion(
        guards.mutationContext(request, principal),
        request.params.versionId,
        body,
      );
      return reply
        .header("cache-control", "private, no-store")
        .send({ data: decision });
    },
  );

  if (publishedArtifacts) {
    app.get<{ Params: { "*": string } }>(
      "/artifacts/*",
      async (request, reply) => {
        reply.header("cache-control", "no-store");
        const objectKey = request.params["*"];
        if (
          !objectKey ||
          objectKey.includes("\\") ||
          objectKey.includes("..")
        ) {
          throw new AuthoringError(
            "ArtifactPathRejected",
            "artifact 路径无效。",
            400,
          );
        }
        const artifact = await operations.resolvePublishedArtifact(objectKey);
        const body = await publishedArtifacts.getPublished(artifact.objectKey);
        return reply
          .header("content-type", "application/zip")
          .header("content-length", String(artifact.size))
          .header("x-content-sha256", artifact.sha256)
          .header("x-dawnlight-disposition", artifact.disposition)
          .header(
            "content-disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
          )
          .send(Readable.from(body));
      },
    );
  }

  app.post<{ Params: { projectId: string }; Body: unknown }>(
    "/api/v1/ops/projects/:projectId/moderate",
    async (request, reply) => {
      const principal = await guards.requireMutation(request);
      const body = parseBody(moderationSchema, request.body);
      await operations.moderateProject(
        guards.mutationContext(request, principal),
        request.params.projectId,
        body.action,
        body.reason,
      );
      return reply
        .header("cache-control", "no-store")
        .send({ data: { action: body.action } });
    },
  );
}
