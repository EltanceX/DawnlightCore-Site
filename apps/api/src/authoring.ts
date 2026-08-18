import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ServerEnv } from "@dawnlight/config";
import {
  AuthoringError,
  type AuthoringDataService,
  type MutationContext,
  type SessionPrincipal,
  type UploadDataService,
} from "@dawnlight/database";
import type { OidcClient } from "./oidc.js";
import type { QuarantineStorage } from "./storage.js";
import type { PreflightQueue } from "./queue.js";

const sessionCookie = (secure: boolean) =>
  secure ? "__Host-dawnlight_session" : "dawnlight_session";
const transactionCookie = (secure: boolean) =>
  secure ? "__Host-dawnlight_oidc_tx" : "dawnlight_oidc_tx";
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

const slugSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const licenseSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9.+-]+$/)
  .nullable();
const compatibilitySchema = z
  .array(
    z.object({
      coreRange: z.string().min(1).max(160),
      gameApiTag: z.string().min(1).max(80),
      platforms: z.array(z.string().min(1).max(40)).max(12),
      architectures: z.array(z.string().min(1).max(40)).max(12),
      gpuClasses: z.array(z.string().min(1).max(80)).max(20),
      note: z.string().max(500),
    }),
  )
  .max(32);
const artifactDeclarationsSchema = z
  .array(
    z.object({
      fileName: z.string().min(1).max(160),
      platform: z.string().min(1).max(40),
      architecture: z.string().min(1).max(40),
      gpuClass: z.string().min(1).max(80),
      expectedSize: z.number().int().positive().max(536_870_912).nullable(),
    }),
  )
  .max(16);
const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(160),
  size: z.number().int().positive().max(536_870_912),
  contentType: z
    .enum([
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ])
    .default("application/zip"),
});
const createProjectSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(100),
  summary: z.string().min(10).max(500),
  licenseSpdx: licenseSchema,
});
const projectPatchSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    summary: z.string().min(10).max(500).optional(),
    licenseSpdx: licenseSchema.optional(),
    status: z.enum(["draft", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const createVersionSchema = z.object({
  version: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[0-9]+(?:\.[0-9]+){1,2}(?:[-.][A-Za-z0-9.]+)?$/),
  channel: z.enum(["preview", "alpha", "beta", "stable"]),
  changelog: z.string().max(20_000),
  licenseSpdx: licenseSchema,
  compatibility: compatibilitySchema,
  artifactDeclarations: artifactDeclarationsSchema,
});
const versionPatchSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    channel: z.enum(["preview", "alpha", "beta", "stable"]).optional(),
    changelog: z.string().max(20_000).optional(),
    licenseSpdx: licenseSchema.optional(),
    compatibility: compatibilitySchema.optional(),
    artifactDeclarations: artifactDeclarationsSchema.optional(),
  })
  .refine((value) =>
    Object.keys(value).some((key) => key !== "expectedRevision"),
  );

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AuthoringError(
      "InvalidRequest",
      "请求数据不符合作者 API 合同。",
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

function parseSignedCookie(
  request: FastifyRequest,
  name: string,
): string | null {
  const value = request.cookies[name];
  if (!value) return null;
  const result = request.unsignCookie(value);
  return result.valid ? result.value : null;
}

function safeReturnTo(value: unknown): string {
  if (
    typeof value === "string" &&
    /^\/zh-CN\/author(?:\/|$)/.test(value) &&
    !value.startsWith("//")
  ) {
    return value;
  }
  return "/zh-CN/author/";
}

function requestMutationContext(
  request: FastifyRequest,
  principal: SessionPrincipal,
): MutationContext {
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new AuthoringError(
      "IdempotencyKeyRequired",
      "写请求必须提供 8～128 字符的 Idempotency-Key。",
      400,
    );
  }
  return {
    actorId: principal.user.id,
    requestId: request.id,
    idempotencyKey: key,
    requestHash: sha256(JSON.stringify(request.body ?? null)),
  };
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerAuthoringRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  authoring: AuthoringDataService,
  oidc: OidcClient | undefined,
  uploads?: UploadDataService,
  quarantine?: QuarantineStorage,
  preflightQueue?: PreflightQueue,
): void {
  const secureCookies =
    env.APP_ENV === "staging" || env.APP_ENV === "production";
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax" as const,
    signed: true,
  };

  const requireSession = async (request: FastifyRequest) => {
    const token = parseSignedCookie(request, sessionCookie(secureCookies));
    const principal = token ? await authoring.getSession(sha256(token)) : null;
    if (!principal) {
      throw new AuthoringError(
        "AuthenticationRequired",
        "请先登录作者工作区。",
        401,
      );
    }
    return principal;
  };

  const requireMutation = async (request: FastifyRequest) => {
    const principal = await requireSession(request);
    const origin = request.headers.origin;
    if (origin !== env.CORS_ORIGIN) {
      throw new AuthoringError("OriginRejected", "写请求来源未被允许。", 403);
    }
    const csrf = request.headers["x-csrf-token"];
    if (
      typeof csrf !== "string" ||
      !constantTimeEqual(csrf, principal.csrfToken)
    ) {
      throw new AuthoringError("CsrfRejected", "CSRF 校验失败。", 403);
    }
    return principal;
  };

  const beginOidcLogin = async (
    returnTo: unknown,
    invite: unknown,
    reply: FastifyReply,
  ) => {
    if (!env.OIDC_ENABLED || !oidc) {
      throw new AuthoringError(
        "OidcUnavailable",
        "当前环境尚未启用 OIDC provider。",
        503,
      );
    }
    const start = await oidc.createAuthorizationRequest();
    await authoring.createLoginTransaction(
      sha256(start.state),
      {
        codeVerifier: start.codeVerifier,
        nonce: start.nonce,
        returnTo: safeReturnTo(returnTo),
        accountInviteTokenHash:
          typeof invite === "string" && invite.length > 0
            ? sha256(invite)
            : null,
      },
      new Date(Date.now() + env.AUTH_LOGIN_TTL_SECONDS * 1000),
    );
    return reply
      .setCookie(transactionCookie(secureCookies), start.state, {
        ...cookieOptions,
        maxAge: env.AUTH_LOGIN_TTL_SECONDS,
      })
      .header("cache-control", "no-store")
      .redirect(start.authorizationUrl);
  };

  app.get<{ Querystring: { returnTo?: string; invite?: string } }>(
    "/api/v1/auth/oidc/start",
    async (request, reply) =>
      beginOidcLogin(request.query.returnTo, request.query.invite, reply),
  );

  app.post<{
    Body: { returnTo?: string; invite?: string };
  }>("/api/v1/auth/oidc/start", async (request, reply) =>
    beginOidcLogin(request.body?.returnTo, request.body?.invite, reply),
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/v1/auth/oidc/callback",
    async (request, reply) => {
      if (!env.OIDC_ENABLED || !oidc) {
        throw new AuthoringError("OidcUnavailable", "OIDC 未启用。", 503);
      }
      const state = request.query.state;
      const cookieState = parseSignedCookie(
        request,
        transactionCookie(secureCookies),
      );
      if (!state || !cookieState || !constantTimeEqual(state, cookieState)) {
        throw new AuthoringError(
          "OidcStateMismatch",
          "OIDC state 与当前浏览器登录事务不匹配。",
          400,
        );
      }
      const transaction = await authoring.consumeLoginTransaction(
        sha256(state),
      );
      const callbackUrl = new URL(env.OIDC_REDIRECT_URI);
      for (const [key, value] of Object.entries(request.query)) {
        if (value !== undefined) callbackUrl.searchParams.set(key, value);
      }
      const identity = await oidc.consumeAuthorizationResponse(callbackUrl, {
        state,
        codeVerifier: transaction.codeVerifier,
        nonce: transaction.nonce,
      });
      const sessionToken = randomToken();
      const csrfToken = randomToken();
      const expiresAt = new Date(
        Date.now() + env.AUTH_SESSION_TTL_SECONDS * 1000,
      );
      await authoring.completeOidcLogin({
        identity,
        accountInviteTokenHash: transaction.accountInviteTokenHash,
        sessionTokenHash: sha256(sessionToken),
        csrfToken,
        expiresAt,
        requestId: request.id,
      });
      const destination = new URL(
        transaction.returnTo,
        env.OIDC_WEB_RETURN_ORIGIN,
      );
      destination.searchParams.set("login", "success");
      reply
        .clearCookie(transactionCookie(secureCookies), cookieOptions)
        .setCookie(sessionCookie(secureCookies), sessionToken, {
          ...cookieOptions,
          maxAge: env.AUTH_SESSION_TTL_SECONDS,
        })
        .header("cache-control", "no-store")
        .redirect(destination.href);
    },
  );

  app.get("/api/v1/auth/session", async (request, reply) => {
    const principal = await requireSession(request);
    return reply.header("cache-control", "private, no-store").send({
      data: principal,
    });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await requireMutation(request);
    const token = parseSignedCookie(request, sessionCookie(secureCookies));
    if (token) await authoring.revokeSession(sha256(token), request.id);
    return reply
      .clearCookie(sessionCookie(secureCookies), cookieOptions)
      .header("cache-control", "no-store")
      .send({ data: { loggedOut: true } });
  });

  app.post("/api/v1/auth/invitations", async (request, reply) => {
    const principal = await requireMutation(request);
    const body = parseBody(
      z.object({ email: z.string().email().max(320) }),
      request.body,
    );
    const token = randomToken();
    const invitation = await authoring.createAccountInvitation(
      requestMutationContext(request, principal),
      {
        email: body.email,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    );
    return reply
      .header("cache-control", "private, no-store")
      .code(201)
      .send({
        data: { ...invitation, token },
      });
  });

  app.post<{ Params: { userId: string } }>(
    "/api/v1/auth/users/:userId/disable",
    async (request, reply) => {
      const principal = await requireMutation(request);
      const body = parseBody(
        z.object({ reason: z.string().min(10).max(1000) }),
        request.body,
      );
      const user = await authoring.disableUser(
        requestMutationContext(request, principal),
        request.params.userId,
        body.reason,
      );
      return reply
        .header("cache-control", "private, no-store")
        .send({ data: user });
    },
  );

  app.get("/api/v1/author/projects", async (request, reply) => {
    const principal = await requireSession(request);
    return reply.header("cache-control", "private, no-store").send({
      data: await authoring.listProjects(principal.user.id),
    });
  });

  if (uploads && quarantine && preflightQueue) {
    app.post<{
      Params: { projectId: string; versionId: string };
    }>(
      "/api/v1/author/projects/:projectId/versions/:versionId/uploads",
      async (request, reply) => {
        const principal = await requireMutation(request);
        const body = parseBody(uploadRequestSchema, request.body);
        if (
          !body.fileName.toLowerCase().endsWith(".zip") ||
          /[\\/\0]/.test(body.fileName) ||
          body.fileName === "." ||
          body.fileName === ".."
        ) {
          throw new AuthoringError(
            "UploadFileNameInvalid",
            "上传文件必须是单层 .zip 文件名。",
            400,
          );
        }
        if (body.size > env.UPLOAD_MAX_BYTES) {
          throw new AuthoringError(
            "UploadTooLarge",
            "上传文件超过当前环境的大小上限。",
            413,
            { maxBytes: env.UPLOAD_MAX_BYTES },
          );
        }
        const uploadId = crypto.randomUUID();
        const session = await uploads.createUpload(
          requestMutationContext(request, principal),
          request.params.projectId,
          request.params.versionId,
          {
            id: uploadId,
            objectKey: `uploads/${request.params.projectId}/${request.params.versionId}/${uploadId}/archive.zip`,
            fileName: body.fileName,
            expectedSize: body.size,
            contentType: body.contentType,
            expiresAt: new Date(
              Date.now() + env.UPLOAD_SESSION_TTL_SECONDS * 1000,
            ),
          },
        );
        const uploadUrl = await quarantine.createUploadUrl(
          session.objectKey,
          session.contentType,
          env.UPLOAD_URL_TTL_SECONDS,
        );
        return reply
          .code(201)
          .header("cache-control", "private, no-store")
          .send({
            data: {
              uploadId: session.id,
              method: "PUT",
              uploadUrl,
              expiresAt: session.expiresAt,
              maxBytes: env.UPLOAD_MAX_BYTES,
              requiredHeaders: { "content-type": session.contentType },
            },
          });
      },
    );

    app.get<{ Params: { uploadId: string } }>(
      "/api/v1/author/uploads/:uploadId",
      async (request, reply) => {
        const principal = await requireSession(request);
        const upload = await uploads.getAuthorUpload(
          principal.user.id,
          request.params.uploadId,
        );
        return reply.header("cache-control", "private, no-store").send({
          data: upload,
        });
      },
    );

    app.post<{ Params: { uploadId: string } }>(
      "/api/v1/author/uploads/:uploadId/complete",
      async (request, reply) => {
        const principal = await requireMutation(request);
        const mutation = requestMutationContext(request, principal);
        const existing = await uploads.getUploadForCompletion(
          principal.user.id,
          request.params.uploadId,
        );
        const head =
          existing.status === "created"
            ? await quarantine.head(existing.objectKey)
            : {
                size: existing.objectSize ?? existing.expectedSize,
                contentType: existing.contentType,
                etag: existing.objectEtag,
              };
        const completed = await uploads.completeUpload(
          mutation,
          request.params.uploadId,
          head,
        );
        try {
          await preflightQueue.enqueue(completed.id);
          await uploads.markPreflightDispatched(completed.id);
        } catch (error) {
          request.log.warn({ error }, "preflight enqueue deferred to outbox");
        }
        return reply.header("cache-control", "private, no-store").send({
          data: {
            uploadId: completed.id,
            status: completed.status,
            objectSize: completed.objectSize,
          },
        });
      },
    );
  }

  app.post("/api/v1/author/projects", async (request, reply) => {
    const principal = await requireMutation(request);
    const project = await authoring.createProject(
      requestMutationContext(request, principal),
      parseBody(createProjectSchema, request.body),
    );
    return reply
      .header("cache-control", "private, no-store")
      .code(201)
      .send({ data: project });
  });

  app.patch<{ Params: { projectId: string } }>(
    "/api/v1/author/projects/:projectId",
    async (request, reply) => {
      const principal = await requireMutation(request);
      const project = await authoring.updateProject(
        requestMutationContext(request, principal),
        request.params.projectId,
        parseBody(projectPatchSchema, request.body),
      );
      return reply
        .header("cache-control", "private, no-store")
        .send({ data: project });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/v1/author/projects/:projectId/versions",
    async (request, reply) => {
      const principal = await requireMutation(request);
      const version = await authoring.createVersion(
        requestMutationContext(request, principal),
        request.params.projectId,
        parseBody(createVersionSchema, request.body),
      );
      return reply
        .header("cache-control", "private, no-store")
        .code(201)
        .send({ data: version });
    },
  );

  app.patch<{ Params: { projectId: string; versionId: string } }>(
    "/api/v1/author/projects/:projectId/versions/:versionId",
    async (request, reply) => {
      const principal = await requireMutation(request);
      const version = await authoring.updateVersion(
        requestMutationContext(request, principal),
        request.params.projectId,
        request.params.versionId,
        parseBody(versionPatchSchema, request.body),
      );
      return reply
        .header("cache-control", "private, no-store")
        .send({ data: version });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/v1/author/projects/:projectId/invitations",
    async (request, reply) => {
      const principal = await requireMutation(request);
      const body = parseBody(
        z.object({
          email: z.string().email().max(320),
          role: z.enum(["maintainer", "reviewer"]),
        }),
        request.body,
      );
      const token = randomToken();
      const invitation = await authoring.createProjectInvitation(
        requestMutationContext(request, principal),
        request.params.projectId,
        {
          ...body,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      );
      return reply
        .header("cache-control", "private, no-store")
        .code(201)
        .send({
          data: { ...invitation, token },
        });
    },
  );

  app.post("/api/v1/author/invitations/accept", async (request, reply) => {
    const principal = await requireMutation(request);
    const body = parseBody(
      z.object({ token: z.string().min(32).max(128) }),
      request.body,
    );
    const project = await authoring.acceptProjectInvitation(
      requestMutationContext(request, principal),
      sha256(body.token),
    );
    return reply
      .header("cache-control", "private, no-store")
      .send({ data: project });
  });

  app.delete<{ Params: { projectId: string; invitationId: string } }>(
    "/api/v1/author/projects/:projectId/invitations/:invitationId",
    async (request, reply) => {
      const principal = await requireMutation(request);
      await authoring.revokeProjectInvitation(
        requestMutationContext(request, principal),
        request.params.projectId,
        request.params.invitationId,
      );
      return reply.header("cache-control", "private, no-store").send({
        data: { revoked: true },
      });
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/author/projects/:projectId/audit",
    async (request, reply) => {
      const principal = await requireSession(request);
      const events = await authoring.listAuditEvents(
        principal.user.id,
        request.params.projectId,
      );
      return reply
        .header("cache-control", "private, no-store")
        .send({ data: events });
    },
  );
}
