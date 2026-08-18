import { createHash, createPrivateKey, sign } from "node:crypto";
import type { ServerEnv } from "@dawnlight/config";
import type { PublicationCandidate } from "@dawnlight/database";
import type { WorkerQuarantineStorage } from "./storage.js";

function safeSegment(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("InvalidPublishedPathSegment");
  }
  return normalized;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function publishCandidate(
  candidate: PublicationCandidate,
  storage: WorkerQuarantineStorage,
  env: ServerEnv,
) {
  if (!env.RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64) {
    throw new Error("ReleaseFeedSigningKeyNotConfigured");
  }
  const objectKey = [
    "shaderpacks",
    safeSegment(candidate.projectSlug),
    safeSegment(candidate.version),
    `${candidate.inputSha256}.zip`,
  ].join("/");
  await storage.copyToPublished(
    candidate.sourceObjectKey,
    objectKey,
    candidate.inputSha256,
  );
  const head = await storage.headPublished(objectKey);
  if (head.size !== candidate.inputSize) {
    throw new Error("PublishedObjectSizeMismatch");
  }
  if (head.sha256 !== candidate.inputSha256) {
    throw new Error("PublishedObjectHashMetadataMismatch");
  }
  const publicUrl = `${env.PUBLISHED_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releases: [
      {
        projectId: candidate.projectId,
        projectSlug: candidate.projectSlug,
        versionId: candidate.versionId,
        version: candidate.version,
        coreCommit: candidate.coreCommit,
        artifact: {
          fileName: candidate.fileName,
          size: candidate.inputSize,
          sha256: candidate.inputSha256,
          url: publicUrl,
        },
      },
    ],
  };
  const canonical = canonicalJson(payload);
  const payloadSha256 = createHash("sha256").update(canonical).digest("hex");
  const privateKey = createPrivateKey(
    Buffer.from(env.RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64, "base64"),
  );
  const signatureBase64 = sign(
    null,
    Buffer.from(canonical),
    privateKey,
  ).toString("base64");
  return {
    artifact: { objectKey, publicUrl, size: head.size },
    feed: {
      payload,
      payloadSha256,
      signatureBase64,
      signingKeyId: env.RELEASE_FEED_SIGNING_KEY_ID,
    },
  };
}
