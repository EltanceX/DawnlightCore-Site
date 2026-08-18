import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  CatalogKind,
  ContractDataService,
} from "@dawnlight/contract-data";

const cacheControl =
  "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800";
const catalogKinds = new Set<CatalogKind>([
  "stage-template",
  "service",
  "semantic-provider",
  "engine-draw-provider",
]);

function sendCacheable(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
) {
  const etag = `"${createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")}"`;
  reply.header("cache-control", cacheControl).header("etag", etag);
  if (request.headers["if-none-match"] === etag) {
    return reply.code(304).send();
  }
  return reply.send(payload);
}

function parseCatalogKind(value: unknown): CatalogKind | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "string" && catalogKinds.has(value as CatalogKind)) {
    return value as CatalogKind;
  }
  return undefined;
}

export function registerContractRoutes(
  app: FastifyInstance,
  contracts: ContractDataService,
): void {
  app.get("/api/v1/contracts", async (request, reply) =>
    sendCacheable(request, reply, {
      data: await contracts.listVersions(),
    }),
  );

  app.get<{ Params: { contractVersion: string } }>(
    "/api/v1/contracts/:contractVersion",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.getContract(request.params.contractVersion),
      }),
  );

  app.get<{ Params: { contractVersion: string } }>(
    "/api/v1/contracts/:contractVersion/diagnostics",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.listDiagnostics(request.params.contractVersion),
      }),
  );

  app.get<{ Params: { contractVersion: string; code: string } }>(
    "/api/v1/contracts/:contractVersion/diagnostics/:code",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.getDiagnostic(
          request.params.contractVersion,
          request.params.code,
        ),
      }),
  );

  app.get<{
    Params: { contractVersion: string };
    Querystring: { kind?: string };
  }>("/api/v1/contracts/:contractVersion/catalog", async (request, reply) => {
    const kind = parseCatalogKind(request.query.kind);
    if (request.query.kind && !kind) {
      return reply.code(400).send({
        error: {
          code: "InvalidCatalogKind",
          message: "Catalog kind is not supported.",
          requestId: request.id,
          details: { allowed: [...catalogKinds] },
        },
      });
    }
    return sendCacheable(request, reply, {
      data: await contracts.listCatalog(request.params.contractVersion, kind),
    });
  });

  app.get<{
    Params: { contractVersion: string; kind: string; id: string };
  }>(
    "/api/v1/contracts/:contractVersion/catalog/:kind/:id",
    async (request, reply) => {
      const kind = parseCatalogKind(request.params.kind);
      if (!kind) {
        return reply.code(400).send({
          error: {
            code: "InvalidCatalogKind",
            message: "Catalog kind is not supported.",
            requestId: request.id,
            details: { allowed: [...catalogKinds] },
          },
        });
      }
      return sendCacheable(request, reply, {
        data: await contracts.getCatalog(
          request.params.contractVersion,
          request.params.id,
          kind,
        ),
      });
    },
  );

  app.get<{ Params: { contractVersion: string } }>(
    "/api/v1/contracts/:contractVersion/capabilities",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.listCapabilities(request.params.contractVersion),
      }),
  );

  app.get<{ Params: { contractVersion: string; id: string } }>(
    "/api/v1/contracts/:contractVersion/capabilities/:id",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.getCapability(
          request.params.contractVersion,
          request.params.id,
        ),
      }),
  );

  app.get<{ Params: { contractVersion: string } }>(
    "/api/v1/contracts/:contractVersion/graph",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.getGraph(request.params.contractVersion),
      }),
  );

  app.get<{ Params: { contractVersion: string } }>(
    "/api/v1/contracts/:contractVersion/variant",
    async (request, reply) =>
      sendCacheable(request, reply, {
        data: await contracts.getVariant(request.params.contractVersion),
      }),
  );

  app.get<{ Querystring: { from: string; to: string } }>(
    "/api/v1/contracts/diff",
    async (request, reply) => {
      if (!request.query.from || !request.query.to) {
        return reply.code(400).send({
          error: {
            code: "MissingContractDiffVersion",
            message: "Both from and to contract versions are required.",
            requestId: request.id,
          },
        });
      }
      return sendCacheable(request, reply, {
        data: await contracts.diff(request.query.from, request.query.to),
      });
    },
  );
}
