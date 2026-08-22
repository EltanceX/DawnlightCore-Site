import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const read = (path) => readFileSync(resolve(path), "utf8");
const fail = (message) => {
  console.error(`Image publish workflow validation failed: ${message}`);
  process.exit(1);
};

const publishPath = ".github/workflows/publish-images.yml";
const publishText = read(publishPath);
const publish = parseYaml(publishText);
const qualityText = read(".github/workflows/quality.yml");
const quality = parseYaml(qualityText);
const job = publish?.jobs?.publish;

if (!publish?.on?.workflow_call) fail("workflow_call trigger is required");
if (publish.on.workflow_call.inputs?.source_sha?.required !== true) {
  fail("workflow_call must require the full source_sha");
}
if (!job) fail("publish job is required");
if (job.environment !== "beta-images") {
  fail("GHCR writes must use the beta-images environment boundary");
}
for (const [permission, value] of Object.entries({
  contents: "read",
  packages: "write",
  "id-token": "write",
  attestations: "write",
  "artifact-metadata": "write",
})) {
  if (job.permissions?.[permission] !== value) {
    fail(`publish job must grant ${permission}: ${value}`);
  }
}

for (const image of [
  "ghcr.io/eltancex/dawnlight-web",
  "ghcr.io/eltancex/dawnlight-api",
  "ghcr.io/eltancex/dawnlight-worker",
]) {
  if (!publishText.includes(image))
    fail(`missing immutable image source ${image}`);
}
for (const marker of [
  "push: true",
  "sbom: true",
  "provenance: mode=max",
  "push-to-registry: true",
  "severity: HIGH,CRITICAL",
  'exit-code: "0"',
  "continue-on-error: true",
  "node scripts/check-image-vulnerabilities.mjs",
  "node scripts/create-ci-image-manifest.mjs",
]) {
  if (!publishText.includes(marker)) fail(`workflow is missing ${marker}`);
}
for (const target of ["target: web", "target: api", "target: worker"]) {
  if (!publishText.includes(target)) fail(`workflow is missing ${target}`);
}
if (publishText.includes(":latest")) fail("latest tags are forbidden");
if (!publishText.includes("tag=sha-$revision")) {
  fail("image tag must be derived from the full clean revision");
}

for (const step of job.steps ?? []) {
  if (!step.uses || step.uses.startsWith("./")) continue;
  if (!/@[0-9a-f]{40}$/.test(step.uses)) {
    fail(`third-party action must be pinned to a full commit: ${step.uses}`);
  }
}

const caller = quality?.jobs?.["publish-images"];
if (!caller) fail("Quality must call the image publishing workflow");
if (caller.needs !== "verify") fail("image publishing must depend on verify");
if (caller.uses !== "./.github/workflows/publish-images.yml") {
  fail("Quality must call the local pinned publishing workflow");
}
if (caller.with?.source_sha !== "${{ github.sha }}") {
  fail("Quality must pass its verified full commit to the publishing workflow");
}
if (!qualityText.includes("github.event_name == 'push'")) {
  fail("publishing must be restricted to push events");
}

for (const path of [
  "scripts/check-image-vulnerabilities.mjs",
  "scripts/create-ci-image-manifest.mjs",
  "docs/V2-WP9-4-ImageSupplyChain.md",
  "docs/V2-WP9-5-CandidateStagingEvidence.md",
]) {
  read(path);
}
const stagingEvidence = read("docs/V2-WP9-5-CandidateStagingEvidence.md");
for (const marker of [
  "68d13a80ba18ee042058ca4e52a2f26c348ea383",
  "engineering-only",
  "Release Owner acknowledgement: PENDING",
  "Production disposition: NO-GO",
]) {
  if (!stagingEvidence.includes(marker)) {
    fail(`candidate staging evidence must preserve boundary: ${marker}`);
  }
}
for (const path of [
  "infra/images/Dockerfile.web",
  "infra/images/Dockerfile.services",
  "infra/compose/wp9-a.compose.yml",
  "infra/compose/wp9-a.env.example",
  "scripts/create-wp9-a-env.mjs",
]) {
  const source = read(path);
  if (!source.includes("https://github.com/EltanceX/DawnlightCore-Site")) {
    fail(`${path} must use the canonical GitHub source URL`);
  }
  if (source.includes("https://github.com/EltanceX/dawnlight-core")) {
    fail(`${path} must not retain the obsolete GitHub source URL`);
  }
}

console.log(
  "WP9 image publishing validation passed (quality-gated GHCR digests, SBOM, provenance, attestation and fixable-critical scan gate).",
);
