import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SearchDataService, SearchKind } from "@dawnlight/database";

const cacheControl =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=600";

function sendSearch(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
) {
  const etag = `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}"`;
  reply.header("cache-control", cacheControl).header("etag", etag);
  if (request.headers["if-none-match"] === etag) return reply.code(304).send();
  return reply.send(payload);
}

function value(input: unknown, max = 160) {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

const kinds = new Set<SearchKind>([
  "project",
  "version",
  "diagnostic",
  "catalog",
  "capability",
]);

export function registerSearchRoutes(
  app: FastifyInstance,
  search: SearchDataService,
) {
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/v1/search",
    async (request, reply) => {
      const requestedKind = value(request.query.kind, 24);
      const kind =
        requestedKind && kinds.has(requestedKind as SearchKind)
          ? (requestedKind as SearchKind)
          : undefined;
      const rawLimit = Number(request.query.limit ?? 20);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 50)
        : 20;
      const payload = {
        data: await search.search({
          q: value(request.query.q),
          kind,
          contractVersion: value(request.query.contractVersion, 120),
          core: value(request.query.core, 80),
          gameApi: value(request.query.gameApi, 80),
          platform: value(request.query.platform, 40),
          architecture: value(request.query.architecture, 40),
          gpu: value(request.query.gpu, 80),
          channel: value(request.query.channel, 40),
          license: value(request.query.license, 80),
          cursor: value(request.query.cursor, 120),
          limit,
        }),
      };
      return sendSearch(request, reply, payload);
    },
  );
}
