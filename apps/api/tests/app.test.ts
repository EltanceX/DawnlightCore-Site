import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseServerEnv } from "@dawnlight/config";
import { resolve } from "node:path";
import { loadContractBundle } from "@dawnlight/contract-data/node";
import { createContractDataService } from "@dawnlight/contract-data";
import { createDirectoryDataService } from "@dawnlight/contract-data";
import { readFileSync } from "node:fs";
import type {
  AuthoringDataService,
  AuthorProject,
  CompleteLoginInput,
  LoginTransaction,
  SessionPrincipal,
  PublishingDataService,
  ReviewSubmission,
  SearchDataService,
  OperationsDataService,
} from "@dawnlight/database";
import type { OidcClient } from "../src/oidc.js";

const env = parseServerEnv({ APP_ENV: "test" });
const contractFixture = loadContractBundle(
  resolve(process.cwd(), "../../contracts/dawnlight/preview"),
).fixture;
const contracts = createContractDataService([contractFixture]);
const directory = createDirectoryDataService(
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../../contracts/dawnlight/preview/directory-fixture.json",
      ),
      "utf8",
    ),
  ),
);
const apps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("API health shell", () => {
  it("returns a live response without database access", async () => {
    const app = await createApp(env);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "dawnlight-api",
    });
  });

  it("returns not-ready when an injected dependency fails", async () => {
    const app = await createApp(env, {
      checkObjectStorage: async () => {
        throw new Error("fixture failure");
      },
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.objectStorage).toMatchObject({
      status: "failed",
    });
  });

  it("serves versioned contract data with ETag and explainable errors", async () => {
    const app = await createApp(env, { contracts });
    apps.push(app);
    const version = contractFixture.contract.version;
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/contracts/${version}/diagnostics`,
    });
    expect(list.statusCode).toBe(200);
    expect(list.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(list.json().data).toHaveLength(4);

    const notModified = await app.inject({
      method: "GET",
      url: `/api/v1/contracts/${version}/diagnostics`,
      headers: { "if-none-match": list.headers.etag },
    });
    expect(notModified.statusCode).toBe(304);

    const unavailable = await app.inject({
      method: "GET",
      url: `/api/v1/contracts/${version}/graph`,
    });
    expect(unavailable.statusCode).toBe(200);
    expect(unavailable.json().data.status).toBe("unavailable");

    const catalog = await app.inject({
      method: "GET",
      url: `/api/v1/contracts/${version}/catalog/semantic-provider/${encodeURIComponent("dawnlight:frame/view_width")}`,
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().data.id).toBe("dawnlight:frame/view_width");

    const diff = await app.inject({
      method: "GET",
      url: `/api/v1/contracts/diff?from=${version}&to=${version}`,
    });
    expect(diff.statusCode).toBe(200);
    expect(diff.json().data.changed).toHaveLength(0);

    const missing = await app.inject({
      method: "GET",
      url: `/api/v1/contracts/${version}/diagnostics/DoesNotExist`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("ContractEntityNotFound");
  });

  it("serves public directory recommendations without private artifact fields", async () => {
    const app = await createApp(env, { directory });
    apps.push(app);
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/directory/projects?gameApi=API_1.9.2.1",
    });
    expect(list.statusCode).toBe(200);
    expect(list.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(list.json().data[0]).toMatchObject({
      slug: "dawnlight-v3-1",
      recommendation: { artifact: null },
    });
    expect(JSON.stringify(list.json())).not.toContain("objectKey");

    const detail = await app.inject({
      method: "GET",
      url: "/api/v1/directory/projects/dawnlight-v3-1/versions/3.1",
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.latestVersion.status).toBe("metadata-only");
  });

  it("serves faceted search, coarse download redirects and an admin-only operations view", async () => {
    const search: SearchDataService = {
      async search(query) {
        return {
          items: [
            {
              kind: "project",
              id: "community:project-1",
              title: "Dawnlight",
              summary: `query=${query.q ?? ""}`,
              url: "/shaders/dawnlight",
              version: "3.1",
              status: "available",
              core: "de780e826a1a8537cf120600caf68e9d890737ac",
              gameApi: "API_1.9.2.1",
            },
          ],
          nextCursor: null,
          facets: { platform: ["windows"] },
        };
      },
    };
    const operations = createOperationsFixture();
    const authoring = createAdminAuthoringFixture();
    const app = await createApp(env, { search, operations, authoring });
    apps.push(app);

    const found = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=dawnlight&platform=windows",
    });
    expect(found.statusCode).toBe(200);
    expect(found.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(found.json().data.items[0]).toMatchObject({ kind: "project" });

    const redirect = await app.inject({
      method: "GET",
      url: "/api/v1/downloads/artifacts/community-artifact:version-1",
      headers: { "x-download-event-id": "download-test-1" },
    });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe(
      "https://cdn.example.test/shaderpacks/test.zip",
    );
    expect(redirect.headers["x-content-sha256"]).toBe("a".repeat(64));

    const report = await app.inject({
      method: "POST",
      url: "/api/v1/reports",
      payload: {
        resourceId: "community:project-1",
        contact: "reporter@example.test",
        reason: "This fixture report has enough detail.",
      },
    });
    expect(report.statusCode).toBe(201);
    expect(report.headers["cache-control"]).toBe("no-store");

    const unauthorized = await app.inject({
      method: "GET",
      url: "/api/v1/ops/overview",
    });
    expect(unauthorized.statusCode).toBe(401);

    const cookie = `dawnlight_session=${app.signCookie("ops-session-token")}`;
    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/ops/overview?days=7",
      headers: { cookie },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.headers["cache-control"]).toBe("private, no-store");
    expect(overview.json().data).toMatchObject({ reviewQueue: 1 });

    const rejectedMutation = await app.inject({
      method: "POST",
      url: "/api/v1/ops/projects/11111111-1111-4111-8111-111111111111/moderate",
      headers: { cookie },
      payload: { action: "hide", reason: "policy test" },
    });
    expect(rejectedMutation.statusCode).toBe(403);
    expect(rejectedMutation.json().error.code).toBe("OriginRejected");
  });

  it("rate limits public search without persisting client addresses", async () => {
    const search: SearchDataService = {
      async search() {
        return { items: [], nextCursor: null, facets: {} };
      },
    };
    const app = await createApp(
      { ...env, RATE_LIMIT_SEARCH_PER_MINUTE: 1 },
      { search },
    );
    apps.push(app);

    const first = await app.inject({ method: "GET", url: "/api/v1/search" });
    const limited = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=second",
    });

    expect(first.statusCode).toBe(200);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect(limited.json().error.code).toBe("RateLimited");
  });

  it("completes an injected OIDC flow and protects author writes", async () => {
    const transactions = new Map<string, LoginTransaction>();
    const sessions = new Map<string, SessionPrincipal>();
    const project: AuthorProject = {
      id: "project-1",
      slug: "test-pack",
      name: "Test Pack",
      summary: "An invited author draft used by the API test.",
      licenseSpdx: "MIT",
      status: "draft",
      role: "owner",
      updatedAt: new Date(0).toISOString(),
      versions: [],
    };
    const authoring = createAuthoringFixture(transactions, sessions, project);
    const oidc: OidcClient = {
      async createAuthorizationRequest() {
        return {
          authorizationUrl:
            "https://oidc.example.test/authorize?state=test-state",
          state: "test-state",
          codeVerifier: "test-verifier",
          nonce: "test-nonce",
        };
      },
      async consumeAuthorizationResponse(_url, transaction) {
        expect(transaction).toEqual({
          state: "test-state",
          codeVerifier: "test-verifier",
          nonce: "test-nonce",
        });
        return {
          issuer: "https://oidc.example.test",
          subject: "author-1",
          displayName: "Author One",
          email: "author@example.test",
        };
      },
    };
    const authEnv = parseServerEnv({
      APP_ENV: "test",
      OIDC_ENABLED: "true",
      OIDC_ISSUER_URL: "https://oidc.example.test",
      OIDC_CLIENT_ID: "test-client",
      OIDC_CLIENT_SECRET: "test-client-secret",
      OIDC_REDIRECT_URI: "http://127.0.0.1:4100/api/v1/auth/oidc/callback",
      CORS_ORIGIN: "http://127.0.0.1:3000",
    });
    const publishing = createPublishingFixture();
    const app = await createApp(authEnv, { authoring, oidc, publishing });
    apps.push(app);

    const formStart = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "returnTo=%2Fzh-CN%2Fauthor%2F&invite=one-time-invite-token",
    });
    expect(formStart.statusCode).toBe(302);
    expect(formStart.headers.location).toContain("oidc.example.test/authorize");

    const start = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oidc/start?returnTo=/zh-CN/author/",
    });
    expect(start.statusCode).toBe(302);
    expect(start.headers.location).toContain("oidc.example.test/authorize");
    const transactionCookie = cookiePair(start.headers["set-cookie"]);

    const callback = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oidc/callback?state=test-state&code=test-code",
      headers: { cookie: transactionCookie },
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      "http://127.0.0.1:3000/zh-CN/author/?login=success",
    );
    const setCookies = Array.isArray(callback.headers["set-cookie"])
      ? callback.headers["set-cookie"]
      : [callback.headers["set-cookie"] ?? ""];
    const sessionCookie = cookiePair(
      setCookies.find((value) => value.startsWith("dawnlight_session=")) ?? "",
    );

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: sessionCookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.headers["cache-control"]).toBe("private, no-store");
    expect(session.json().data.user.email).toBe("author@example.test");

    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/author/projects",
      headers: { cookie: sessionCookie },
      payload: {
        slug: "test-pack",
        name: "Test Pack",
        summary: "An invited author draft used by the API test.",
        licenseSpdx: "MIT",
      },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe("OriginRejected");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/author/projects",
      headers: {
        cookie: sessionCookie,
        origin: "http://127.0.0.1:3000",
        "x-csrf-token": session.json().data.csrfToken,
        "idempotency-key": "project-create-1",
      },
      payload: {
        slug: "test-pack",
        name: "Test Pack",
        summary: "An invited author draft used by the API test.",
        licenseSpdx: "MIT",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      slug: "test-pack",
      role: "owner",
    });

    const workflow = await app.inject({
      method: "GET",
      url: "/api/v1/author/projects/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/workflow",
      headers: { cookie: sessionCookie },
    });
    expect(workflow.statusCode).toBe(200);
    expect(workflow.headers["cache-control"]).toBe("private, no-store");
    expect(workflow.json().data.validation.status).toBe("loader-passed");

    const missingOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/author/projects/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/submit",
      headers: {
        cookie: sessionCookie,
        "x-csrf-token": session.json().data.csrfToken,
        "idempotency-key": "version-submit-1",
      },
      payload: { uploadId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(missingOrigin.statusCode).toBe(403);
    expect(missingOrigin.json().error.code).toBe("OriginRejected");

    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/author/projects/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/submit",
      headers: {
        cookie: sessionCookie,
        origin: "http://127.0.0.1:3000",
        "x-csrf-token": session.json().data.csrfToken,
        "idempotency-key": "version-submit-2",
      },
      payload: { uploadId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().data.status).toBe("awaiting-review");

    const reviewQueue = await app.inject({
      method: "GET",
      url: "/api/v1/reviewer/submissions",
      headers: { cookie: sessionCookie },
    });
    expect(reviewQueue.statusCode).toBe(200);
    expect(reviewQueue.json().data).toHaveLength(1);
  });
});

function cookiePair(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(";", 1)[0] ?? "";
}

function createAuthoringFixture(
  transactions: Map<string, LoginTransaction>,
  sessions: Map<string, SessionPrincipal>,
  project: AuthorProject,
): AuthoringDataService {
  const unsupported = async (): Promise<never> => {
    throw new Error("unsupported test operation");
  };
  return {
    async createLoginTransaction(stateHash, transaction) {
      transactions.set(stateHash, transaction);
    },
    async consumeLoginTransaction() {
      const transaction = transactions.values().next().value;
      if (!transaction) throw new Error("missing transaction");
      return transaction;
    },
    async completeOidcLogin(input: CompleteLoginInput) {
      const principal: SessionPrincipal = {
        sessionId: "session-1",
        csrfToken: input.csrfToken,
        expiresAt: input.expiresAt.toISOString(),
        user: {
          id: "user-1",
          displayName: input.identity.displayName,
          email: input.identity.email,
          status: "active",
          isPlatformAdmin: false,
        },
      };
      sessions.set(input.sessionTokenHash, principal);
      return principal;
    },
    async getSession(sessionTokenHash) {
      return sessions.get(sessionTokenHash) ?? null;
    },
    async revokeSession() {},
    createAccountInvitation: unsupported,
    disableUser: unsupported,
    async listProjects() {
      return [project];
    },
    async createProject() {
      return project;
    },
    updateProject: unsupported,
    createVersion: unsupported,
    updateVersion: unsupported,
    createProjectInvitation: unsupported,
    acceptProjectInvitation: unsupported,
    revokeProjectInvitation: unsupported,
    async listAuditEvents() {
      return [];
    },
  };
}

function createPublishingFixture(): PublishingDataService {
  const submission: ReviewSubmission = {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: "11111111-1111-4111-8111-111111111111",
    projectSlug: "test-pack",
    projectName: "Test Pack",
    versionId: "22222222-2222-4222-8222-222222222222",
    version: "1.0.0",
    channel: "preview",
    revision: 1,
    status: "awaiting-review",
    uploadId: "33333333-3333-4333-8333-333333333333",
    validationRunId: "55555555-5555-4555-8555-555555555555",
    submittedBy: "66666666-6666-4666-8666-666666666666",
    submittedAt: new Date(0).toISOString(),
    frozenMetadata: {},
    validation: {
      status: "loader-passed",
      coreCommit: "de780e826a1a8537cf120600caf68e9d890737ac",
      cliVersion: "ShaderPackCli/de780e8",
      validatorImage: `validator@sha256:${"a".repeat(64)}`,
      inputSha256: "b".repeat(64),
      sections: {
        schema: { status: "passed", summary: "schema passed" },
        loader: { status: "passed", summary: "Loader passed" },
        security: { status: "passed", summary: "preflight passed" },
        resource: { status: "passed", summary: "limits passed" },
        compatibility: { status: "declared", summary: "author declaration" },
      },
    },
  };
  return {
    async submitVersion() {
      return submission;
    },
    async listReviewQueue() {
      return [submission];
    },
    async decideReview() {
      return { ...submission, status: "approved" };
    },
    async withdrawVersion() {},
    async getVersionWorkflow() {
      return {
        uploadId: submission.uploadId,
        validation: {
          status: "loader-passed",
          exitCode: 0,
          sections: submission.validation.sections,
          logSummary: "valid=true",
        },
        submission: null,
      };
    },
  };
}

function createAdminAuthoringFixture(): AuthoringDataService {
  const unsupported = async (): Promise<never> => {
    throw new Error("unsupported test operation");
  };
  return {
    createLoginTransaction: unsupported,
    consumeLoginTransaction: unsupported,
    completeOidcLogin: unsupported,
    async getSession() {
      return {
        sessionId: "ops-session",
        csrfToken: "ops-csrf-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: "77777777-7777-4777-8777-777777777777",
          displayName: "Operator",
          email: "operator@example.test",
          status: "active",
          isPlatformAdmin: true,
        },
      };
    },
    revokeSession: unsupported,
    createAccountInvitation: unsupported,
    disableUser: unsupported,
    listProjects: unsupported,
    createProject: unsupported,
    updateProject: unsupported,
    createVersion: unsupported,
    updateVersion: unsupported,
    createProjectInvitation: unsupported,
    acceptProjectInvitation: unsupported,
    revokeProjectInvitation: unsupported,
    listAuditEvents: unsupported,
  };
}

function createOperationsFixture(): OperationsDataService {
  const report = {
    id: "88888888-8888-4888-8888-888888888888",
    resourceId: "community:project-1",
    contact: "reporter@example.test",
    reason: "This fixture report has enough detail.",
    status: "received",
    createdAt: new Date(0).toISOString(),
  };
  return {
    async resolveDownload(artifactId) {
      return {
        artifactId,
        projectVersionId: "community-version:version-1",
        url: "https://cdn.example.test/shaderpacks/test.zip",
        fileName: "test.zip",
        size: 1024,
        sha256: "a".repeat(64),
      };
    },
    async recordDownloadError() {},
    async getOverview() {
      return {
        period: {
          from: new Date(0).toISOString(),
          to: new Date(1).toISOString(),
        },
        downloads: { success: 2, errors: 0, uniqueArtifacts: 1 },
        topArtifacts: [],
        loader: { "loader-passed": 1 },
        validationFailureRate: 0,
        queues: { preflight: 0, loader: 0, publication: 0, review: 1 },
        reviewQueue: 1,
        downloadErrors: [],
        storage: {
          publishedObjects: 1,
          publishedBytes: 1024,
          quarantineObjects: 0,
          quarantineExpectedBytes: 0,
          capacityBytes: null,
        },
      };
    },
    async createReport() {
      return report;
    },
    async listReports() {
      return [report];
    },
    async resolveReport() {
      return { ...report, status: "resolved" };
    },
    async withdrawVersion() {},
    async moderateProject() {},
    async purgeExpiredDownloadEvents() {
      return 0;
    },
  };
}
