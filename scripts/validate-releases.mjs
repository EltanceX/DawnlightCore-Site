import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const sourcePath = resolve("content/releases/releases.json");
const generatedPath = resolve("apps/web/public/feeds/releases-v1.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
const allowedHosts = new Set(
  JSON.parse(
    readFileSync(resolve("content/releases/allowed-hosts.json"), "utf8"),
  ).hosts,
);
const errors = [];

if (JSON.stringify(source) !== JSON.stringify(generated)) {
  errors.push("public release feed does not match content source");
}
if (source.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (Number.isNaN(Date.parse(source.generatedAt))) {
  errors.push("generatedAt must be an ISO timestamp");
}

const releaseIds = new Set();
for (const release of source.releases ?? []) {
  if (releaseIds.has(release.id))
    errors.push(`duplicate release id ${release.id}`);
  releaseIds.add(release.id);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(release.id)) {
    errors.push(`invalid release id ${release.id}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(release.publishedAt)) {
    errors.push(`${release.id}: publishedAt must be UTC ISO-8601`);
  }
  if (!/^\.?[^/].*\.md$/.test(release.releaseNotes)) {
    errors.push(`${release.id}: invalid releaseNotes path`);
  }
  const notesPath = resolve("content/releases", release.releaseNotes);
  if (
    relative(resolve("content/releases"), notesPath).startsWith("..") ||
    !existsSync(notesPath)
  ) {
    errors.push(`${release.id}: releaseNotes file does not exist`);
  }
  if (!release.supportedManifestVersions?.length) {
    errors.push(`${release.id}: supportedManifestVersions is empty`);
  }
  const artifactIds = new Set();
  for (const artifact of release.artifacts ?? []) {
    if (artifactIds.has(artifact.id)) {
      errors.push(`${release.id}: duplicate artifact id ${artifact.id}`);
    }
    artifactIds.add(artifact.id);
    if (!Number.isInteger(artifact.size) || artifact.size <= 0) {
      errors.push(`${release.id}/${artifact.id}: invalid size`);
    }
    if (!/^[0-9a-f]{64}$/.test(artifact.sha256)) {
      errors.push(`${release.id}/${artifact.id}: invalid sha256`);
    }
    const locations = [artifact.primary, ...(artifact.mirrors ?? [])];
    const locationIds = new Set();
    const locationUrls = new Set();
    for (const location of locations) {
      if (locationIds.has(location.id)) {
        errors.push(`${release.id}/${artifact.id}: duplicate location id`);
      }
      if (locationUrls.has(location.url)) {
        errors.push(`${release.id}/${artifact.id}: duplicate location URL`);
      }
      locationIds.add(location.id);
      locationUrls.add(location.url);
      if (!location.url.startsWith("https://")) {
        errors.push(`${release.id}/${artifact.id}: location must use HTTPS`);
      } else if (!allowedHosts.has(new URL(location.url).hostname)) {
        errors.push(
          `${release.id}/${artifact.id}: location host is not approved`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Release validation passed (${source.releases.length} releases).`);
