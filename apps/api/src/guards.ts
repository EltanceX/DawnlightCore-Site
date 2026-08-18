import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { ServerEnv } from "@dawnlight/config";
import {
  AuthoringError,
  type AuthoringDataService,
  type MutationContext,
  type SessionPrincipal,
} from "@dawnlight/database";

const cookieName = (env: ServerEnv) =>
  env.APP_ENV === "staging" || env.APP_ENV === "production"
    ? "__Host-dawnlight_session"
    : "dawnlight_session";
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signedCookie(request: FastifyRequest, name: string) {
  const value = request.cookies[name];
  if (!value) return null;
  const result = request.unsignCookie(value);
  return result.valid ? result.value : null;
}

export function createSessionGuards(
  env: ServerEnv,
  authoring: AuthoringDataService,
) {
  const requireSession = async (request: FastifyRequest) => {
    const token = signedCookie(request, cookieName(env));
    const principal = token ? await authoring.getSession(sha256(token)) : null;
    if (!principal) {
      throw new AuthoringError(
        "AuthenticationRequired",
        "请先登录运营工作区。",
        401,
      );
    }
    return principal;
  };
  const requireMutation = async (request: FastifyRequest) => {
    const principal = await requireSession(request);
    if (request.headers.origin !== env.CORS_ORIGIN) {
      throw new AuthoringError("OriginRejected", "写请求来源未被允许。", 403);
    }
    const csrf = request.headers["x-csrf-token"];
    if (typeof csrf !== "string" || !equal(csrf, principal.csrfToken)) {
      throw new AuthoringError("CsrfRejected", "CSRF 校验失败。", 403);
    }
    return principal;
  };
  const mutationContext = (
    request: FastifyRequest,
    principal: SessionPrincipal,
  ): MutationContext => {
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
  };
  return { requireSession, requireMutation, mutationContext };
}
