import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseServerEnv } from "@dawnlight/config";

const env = parseServerEnv({ APP_ENV: "test" });
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
});
