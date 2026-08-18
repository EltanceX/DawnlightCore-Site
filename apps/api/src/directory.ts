import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  DirectoryDataService,
  DirectoryQuery,
} from "@dawnlight/contract-data";

const cacheControl =
  "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800";

function sendCacheable(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
) {
  const etag = `"${createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")}"`;
  reply.header("cache-control", cacheControl).header("etag", etag);
  if (request.headers["if-none-match"] === etag) return reply.code(304).send();
  return reply.send(payload);
}

function queryValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function registerDirectoryRoutes(
  app: FastifyInstance,
  directory: DirectoryDataService,
): void {
  app.get<{
    Querystring: Record<string, string | undefined>;
  }>("/api/v1/directory/projects", async (request, reply) => {
    const query: DirectoryQuery = {
      q: queryValue(request.query.q),
      core: queryValue(request.query.core),
      gameApi: queryValue(request.query.gameApi),
      platform: queryValue(request.query.platform),
      architecture: queryValue(request.query.architecture),
      gpu: queryValue(request.query.gpu),
      channel: queryValue(request.query.channel),
      license: queryValue(request.query.license),
      status: queryValue(request.query.status),
    };
    return sendCacheable(request, reply, {
      data: await directory.listProjects(query),
    });
  });

  app.get<{ Params: { slug: string } }>(
    "/api/v1/directory/projects/:slug",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await directory.getProject(request.params.slug),
      }),
  );

  app.get<{ Params: { slug: string; version: string } }>(
    "/api/v1/directory/projects/:slug/versions/:version",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await directory.getVersion(
          request.params.slug,
          request.params.version,
        ),
      }),
  );
}
