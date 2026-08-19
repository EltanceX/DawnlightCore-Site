import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument?.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(argument.slice(2), next?.startsWith("--") ? true : next);
}

function inspect(reference) {
  return JSON.parse(
    execFileSync("docker", ["image", "inspect", reference], {
      encoding: "utf8",
    }),
  )[0];
}

const envPath = resolve(
  typeof args.get("env-file") === "string"
    ? args.get("env-file")
    : "infra/compose/wp9-a.env",
);
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const expectedRevision = env.WP9_IMAGE_REVISION;
if (!/^[0-9a-f]{40}$/.test(expectedRevision ?? "")) {
  throw new Error("WP9_IMAGE_REVISION must be a full commit hash.");
}

const references = {
  web: env.WP9_WEB_IMAGE ?? "dawnlight-web:wp9-a",
  api: env.WP9_API_IMAGE ?? "dawnlight-api:wp9-a",
  worker: env.WP9_WORKER_IMAGE ?? "dawnlight-worker:wp9-a",
};
const images = Object.entries(references).map(([service, reference]) => {
  const image = inspect(reference);
  const labels = image.Config?.Labels ?? {};
  if (labels["org.opencontainers.image.revision"] !== expectedRevision) {
    throw new Error(`${reference} does not describe ${expectedRevision}.`);
  }
  if (!image.Config?.User || image.Config.User.startsWith("0")) {
    throw new Error(`${reference} does not declare a non-root runtime user.`);
  }
  return {
    service,
    reference,
    imageId: image.Id,
    repoDigests: image.RepoDigests ?? [],
    platform: `${image.Os}/${image.Architecture}`,
    size: image.Size,
    user: image.Config.User,
    created: labels["org.opencontainers.image.created"],
    revision: labels["org.opencontainers.image.revision"],
    source: labels["org.opencontainers.image.source"],
    version: labels["org.opencontainers.image.version"],
  };
});

const manifest = {
  schemaVersion: 1,
  scope: "WP9-A engineering rehearsal",
  revision: expectedRevision,
  generatedAt: new Date().toISOString(),
  note: "Local image IDs are WP9-A evidence, not registry manifest digests or WP9-B approval.",
  images,
};
const output = resolve(
  typeof args.get("output") === "string"
    ? args.get("output")
    : "reports/wp9-a-image-manifest.json",
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Captured ${images.length} WP9-A images in ${output}.`);
