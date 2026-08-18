import { createHash, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  contractFixtureSchema,
  contractIngestLockSchema,
  contractManifestSchema,
  createContractDataService,
  type ContractBundle,
  type ContractDataService,
  type ContractManifest,
} from "./index.js";

export type LoadContractOptions = {
  requireSignature?: boolean;
  trustedPublicKeys?: ReadonlyMap<string, string>;
};

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeResolve(root: string, path: string): string {
  if (isAbsolute(path))
    throw new Error(`Contract path must be relative: ${path}`);
  const absolute = resolve(root, path);
  const relation = relative(root, absolute);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`Contract path escapes its root: ${path}`);
  }
  return absolute;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifyManifestSignature(
  manifest: ContractManifest,
  options: LoadContractOptions,
): void {
  const { signature, ...payload } = manifest;
  const digest = sha256(canonicalJson(payload));
  if (digest !== signature.signedPayloadSha256) {
    throw new Error("Contract manifest signed payload digest does not match.");
  }
  if (signature.status === "unsigned-preview") {
    if (manifest.publicApiStatus !== "preview-only") {
      throw new Error("Unsigned contracts must remain preview-only.");
    }
    if (options.requireSignature) {
      throw new Error(
        "A verified contract signature is required in this environment.",
      );
    }
    return;
  }
  if (
    !signature.keyId ||
    !signature.value ||
    signature.algorithm !== "ed25519"
  ) {
    throw new Error(
      "Signed contract manifest has an incomplete signature envelope.",
    );
  }
  const publicKey = options.trustedPublicKeys?.get(signature.keyId);
  if (!publicKey)
    throw new Error(`Contract signing key is not trusted: ${signature.keyId}`);
  const valid = verify(
    null,
    Buffer.from(digest, "hex"),
    publicKey,
    Buffer.from(signature.value, "base64"),
  );
  if (!valid)
    throw new Error("Contract manifest signature verification failed.");
}

export function loadContractBundle(
  contractRoot: string,
  options: LoadContractOptions = {},
): ContractBundle {
  const root = resolve(contractRoot);
  const manifestPath = safeResolve(root, "contract-manifest.json");
  const fixturePath = safeResolve(root, "ingest-fixture.json");
  const lockPath = safeResolve(root, "contract-ingest-lock.json");
  const manifestBuffer = readFileSync(manifestPath);
  const fixtureBuffer = readFileSync(fixturePath);
  const manifest = contractManifestSchema.parse(
    JSON.parse(manifestBuffer.toString("utf8")),
  );
  const fixture = contractFixtureSchema.parse(
    JSON.parse(fixtureBuffer.toString("utf8")),
  );
  const lock = contractIngestLockSchema.parse(readJson(lockPath));

  verifyManifestSignature(manifest, options);
  for (const dataset of manifest.datasets) {
    const buffer = readFileSync(safeResolve(root, dataset.path));
    if (
      buffer.byteLength !== dataset.bytes ||
      sha256(buffer) !== dataset.sha256
    ) {
      throw new Error(
        `Contract dataset integrity check failed: ${dataset.path}`,
      );
    }
  }
  const manifestSha256 = sha256(manifestBuffer);
  if (
    lock.manifest.sha256 !== manifestSha256 ||
    lock.manifest.bytes !== manifestBuffer.byteLength ||
    lock.normalizedFixture.sha256 !== sha256(fixtureBuffer) ||
    lock.normalizedFixture.bytes !== fixtureBuffer.byteLength
  ) {
    throw new Error(
      "Contract ingest lock does not match the manifest and fixture.",
    );
  }
  if (
    manifest.contractId !== fixture.contract.id ||
    manifest.contractVersion !== fixture.contract.version ||
    manifest.source.commit !== fixture.contract.sourceCommit ||
    lock.contractVersion !== fixture.contract.version ||
    lock.sourceCommit !== fixture.contract.sourceCommit
  ) {
    throw new Error(
      "Contract manifest, fixture and ingest lock identify different snapshots.",
    );
  }
  const actualRows = {
    schemas: fixture.schemas.length,
    diagnostics: fixture.diagnostics.length,
    catalog: fixture.catalog.length,
    capabilities: fixture.capabilities.length,
    graphs: 1,
    variants: 1,
  };
  if (JSON.stringify(actualRows) !== JSON.stringify(lock.expectedRows)) {
    throw new Error("Contract ingest row counts do not match the lock.");
  }
  return { manifest, fixture, lock, manifestSha256 };
}

export function loadContractDataService(
  contractRoots: string[],
  options: LoadContractOptions = {},
): ContractDataService {
  return createContractDataService(
    contractRoots.map((root) => loadContractBundle(root, options).fixture),
  );
}
