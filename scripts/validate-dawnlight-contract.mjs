import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { contractRoot } from "./contract-config.mjs";

const root = resolve(process.env.DAWNLIGHT_CONTRACT_ROOT ?? contractRoot);

function readJson(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path))
    throw new Error(`Missing contract file: ${relativePath}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

const identifier = z.string().regex(/^[A-Za-z0-9._-]+:[A-Za-z0-9._/-]+$/);
const manifest = z
  .object({
    manifestVersion: z.literal(3),
    id: identifier,
    name: z.string().min(1),
    version: z.string().min(1),
    shaderRoot: z.string().min(1),
    settings: z.string().min(1).optional(),
    fragments: z.array(z.string().min(1)).optional(),
    options: z.array(z.record(z.string(), z.unknown())).optional(),
    resources: z.array(z.record(z.string(), z.unknown())).optional(),
    programs: z.array(z.record(z.string(), z.unknown())).optional(),
    passes: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

const settingsControl = z
  .object({
    id: z.string().min(1),
    option: identifier,
    widget: z.enum(["toggle", "choice", "slider", "text", "color"]),
    label: z.string().min(1),
  })
  .passthrough();
const settings = z
  .object({
    schemaVersion: z.literal(1),
    defaultLocale: z.string().min(2),
    translations: z.record(z.string(), z.record(z.string(), z.string())),
    pages: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          order: z.number(),
          groups: z.array(
            z
              .object({
                id: z.string().min(1),
                title: z.string().min(1),
                order: z.number(),
                controls: z.array(settingsControl),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
    hiddenOptions: z.array(
      z.object({ option: z.string().min(1), reason: z.string().min(1) }),
    ),
  })
  .passthrough();

const metadata = z
  .object({
    contractKind: z.literal("dawnlight-developer-contract"),
    contractVersion: z.string().min(1),
    status: z.literal("preview"),
    source: z.object({
      commit: z.string().regex(/^[0-9a-f]{40}$/),
      exportMode: z.literal("commit-tree-only"),
    }),
    candidate: z.object({
      manifestVersions: z.array(z.literal(3)),
      settingsSchemaVersions: z.array(z.literal(1)),
    }),
  })
  .passthrough();

const lock = z
  .object({
    contractKind: z.literal("dawnlight-developer-contract"),
    contractVersion: z.string().min(1),
    status: z.literal("preview-validated"),
    publicApiStatus: z.literal("preview-only"),
    source: z.object({
      commit: z.string().regex(/^[0-9a-f]{40}$/),
      exportMode: z.literal("commit-tree-only"),
    }),
    files: z.array(
      z.object({
        path: z.string().min(1),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    ),
    blockingReasons: z.array(z.string().min(1)),
  })
  .passthrough();

function assertNoAbsolutePaths(value, location = "$") {
  if (typeof value === "string") {
    if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
      throw new Error(`Absolute path found in ${location}: ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoAbsolutePaths(item, `${location}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      assertNoAbsolutePaths(item, `${location}.${key}`),
    );
  }
}

function parse(label, schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} validation failed:\n${result.error.message}`);
  }
  return result.data;
}

const lockData = parse(
  "contract-lock.json",
  lock,
  readJson("contract-lock.json"),
);
const metadataData = parse(
  "metadata.json",
  metadata,
  readJson("metadata.json"),
);
if (lockData.source.commit !== metadataData.source.commit) {
  throw new Error("Lock and metadata source commits differ.");
}
if (lockData.contractVersion !== metadataData.contractVersion) {
  throw new Error("Lock and metadata contract versions differ.");
}

const manifestPaths = [
  "manifest/shaderpack.json",
  "examples/minimal/shaderpack.json",
  "examples/settings-auto/shaderpack.json",
  "examples/settings-authored/shaderpack.json",
];
manifestPaths.forEach((file) => parse(file, manifest, readJson(file)));
[
  "manifest/settings.json",
  "examples/settings-auto/manifest/ui/settings.json",
  "examples/settings-authored/manifest/ui/settings.json",
].forEach((file) => parse(file, settings, readJson(file)));

const summary = readJson("catalogs/summary.json");
for (const [name, catalog] of Object.entries(summary)) {
  if (
    catalog &&
    typeof catalog === "object" &&
    "count" in catalog &&
    "ids" in catalog
  ) {
    if (catalog.count !== catalog.ids.length)
      throw new Error(`${name} catalog count does not match ids length.`);
    if (new Set(catalog.ids).size !== catalog.ids.length)
      throw new Error(`${name} catalog contains duplicate IDs.`);
  }
}
const verification = readJson("examples/verification.json");
for (const example of verification.examples ?? []) {
  for (const key of ["manifest", "settings"]) {
    if (example[key] && !existsSync(resolve(root, example[key]))) {
      throw new Error(
        `Verification references missing ${key}: ${example[key]}`,
      );
    }
  }
}

for (const file of lockData.files) {
  const absolute = resolve(root, file.path);
  if (!existsSync(absolute))
    throw new Error(`Lock references missing file: ${file.path}`);
  const buffer = readFileSync(absolute);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (buffer.byteLength !== file.bytes || sha256 !== file.sha256) {
    throw new Error(
      `Hash mismatch for ${file.path}: expected ${file.sha256}, got ${sha256}`,
    );
  }
}

for (const file of [
  "metadata.json",
  "catalogs/summary.json",
  "diagnostics/diagnostics.json",
  "cli/metadata.json",
  "examples/verification.json",
]) {
  assertNoAbsolutePaths(readJson(file), file);
}

console.log(
  `Contract validation passed: ${lockData.files.length} locked files, commit ${lockData.source.commit}.`,
);
