import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@dawnlight/config";
import type { PublicationCandidate } from "@dawnlight/database";
import type { WorkerQuarantineStorage } from "./storage.js";
import { canonicalJson, publishCandidate } from "./publication.js";

describe("publication feed canonicalization", () => {
  it("sorts object keys recursively without changing array order", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: [3, 1] } })).toBe(
      '{"a":{"b":[3,1],"d":2},"z":1}',
    );
  });

  it("copies to a hash-addressed key and signs the feed", async () => {
    const keys = generateKeyPairSync("ed25519");
    const sha256 = "a".repeat(64);
    let copiedKey = "";
    const storage: WorkerQuarantineStorage = {
      async get() {
        throw new Error("unused");
      },
      async delete() {},
      async copyToPublished(_source, target, digest) {
        copiedKey = target;
        expect(digest).toBe(sha256);
      },
      async headPublished() {
        return { size: 42, etag: "etag", sha256 };
      },
      async check() {},
    };
    const candidate: PublicationCandidate = {
      submissionId: "submission",
      projectId: "project",
      projectSlug: "Test Pack",
      versionId: "version-id",
      version: "1.0.0",
      uploadId: "upload",
      sourceObjectKey: "uploads/archive.zip",
      inputSha256: sha256,
      inputSize: 42,
      fileName: "pack.zip",
      coreCommit: "b".repeat(40),
      loaderSections: {
        schema: { status: "passed", summary: "passed" },
        loader: {
          status: "passed",
          summary: "passed",
          details: { manifestVersion: 3, settingsSchemaVersion: 1 },
        },
        security: { status: "passed", summary: "passed" },
        resource: { status: "passed", summary: "passed" },
        compatibility: { status: "declared", summary: "declared" },
      },
      frozenMetadata: {},
    };
    const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" });
    const result = await publishCandidate(
      candidate,
      storage,
      parseServerEnv({
        APP_ENV: "test",
        RELEASE_FEED_SIGNING_KEY_ID: "test-key",
        RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64:
          Buffer.from(privatePem).toString("base64"),
      }),
    );
    expect(copiedKey).toBe(`shaderpacks/test-pack/1.0.0/${sha256}.zip`);
    expect(
      verify(
        null,
        Buffer.from(canonicalJson(result.feed.payload)),
        keys.publicKey,
        Buffer.from(result.feed.signatureBase64, "base64"),
      ),
    ).toBe(true);
  });
});
