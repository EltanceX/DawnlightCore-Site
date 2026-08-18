import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseServerEnv } from "@dawnlight/config";
import { resolve } from "node:path";
import { loadContractBundle } from "@dawnlight/contract-data/node";
import { createContractDataService } from "@dawnlight/contract-data";
import { createDirectoryDataService } from "@dawnlight/contract-data";
import { readFileSync } from "node:fs";

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
});
