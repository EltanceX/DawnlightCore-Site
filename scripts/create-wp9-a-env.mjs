import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument?.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(argument.slice(2), next?.startsWith("--") ? true : next);
}

function required(name) {
  const value = args.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing --${name}.`);
  }
  return value;
}

function parseOrigin(name) {
  const raw = required(name);
  const origin = new URL(raw);
  if (!new Set(["http:", "https:"]).has(origin.protocol)) {
    throw new Error(`--${name} must use HTTP or HTTPS.`);
  }
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(`--${name} must be an origin without credentials or path.`);
  }
  return origin.origin;
}

function git(...command) {
  return execFileSync("git", command, { encoding: "utf8" }).trim();
}

const publicOrigin = parseOrigin("public-origin");
const oidcOrigin = parseOrigin("oidc-origin");
const dockerGid = required("docker-gid");
if (!/^\d+$/.test(dockerGid)) throw new Error("--docker-gid must be numeric.");

const status = git("status", "--porcelain");
if (status && !args.has("allow-dirty")) {
  throw new Error(
    "Refusing to describe a dirty source tree; commit first or use --allow-dirty only for a disposable WP9-A build.",
  );
}

const revision = git("rev-parse", "HEAD");
const imageCreated = git("show", "-s", "--format=%cI", "HEAD");
const sourceDateEpoch = git("show", "-s", "--format=%ct", "HEAD");
const workspaceRootValue = args.get("workspace-root");
const workspaceRoot =
  typeof workspaceRootValue === "string"
    ? workspaceRootValue
    : "/srv/dawnlight-wp9-a/validator-workspaces";
if (!isAbsolute(workspaceRoot) || !workspaceRoot.startsWith("/")) {
  throw new Error(
    "--workspace-root must be an absolute POSIX path on the Docker host.",
  );
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
const publicDer = publicKey.export({ format: "der", type: "spki" });
const keyId = `wp9-a-${createHash("sha256").update(publicDer).digest("hex").slice(0, 16)}`;
const secret = () => randomBytes(32).toString("base64url");
const outputValue = args.get("output");
const output = resolve(
  typeof outputValue === "string" ? outputValue : "infra/compose/wp9-a.env",
);
if (existsSync(output) && !args.has("force")) {
  throw new Error(`Refusing to overwrite ${output}; pass --force explicitly.`);
}

const values = {
  WP9_PUBLIC_ORIGIN: publicOrigin,
  WP9_OIDC_ORIGIN: oidcOrigin,
  WP9_BIND_ADDRESS: "0.0.0.0",
  WP9_HTTP_PORT: "58080",
  WP9_OIDC_BIND_ADDRESS: "0.0.0.0",
  WP9_OIDC_PORT: "58082",
  WP9_IMAGE_REVISION: revision,
  WP9_IMAGE_CREATED: imageCreated,
  WP9_SOURCE_DATE_EPOCH: sourceDateEpoch,
  WP9_IMAGE_SOURCE: "https://github.com/EltanceX/dawnlight-core",
  WP9_IMAGE_VERSION: "0.1.0",
  WP9_POSTGRES_PASSWORD: secret(),
  WP9_MINIO_ROOT_USER: "dawnlight-wp9-a",
  WP9_MINIO_ROOT_PASSWORD: secret(),
  WP9_OIDC_CLIENT_SECRET: secret(),
  WP9_AUTH_COOKIE_SECRET: secret(),
  WP9_RELEASE_FEED_SIGNING_KEY_ID: keyId,
  WP9_RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64:
    Buffer.from(privatePem).toString("base64"),
  WP9_VALIDATOR_ENABLED: "false",
  WP9_VALIDATOR_WORKSPACE_ROOT: workspaceRoot,
  WP9_DOCKER_GID: dockerGid,
  WP9_BOOTSTRAP_ADMIN_EMAIL: "author@example.test",
};

writeFileSync(
  output,
  `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`,
  { encoding: "utf8", mode: 0o600 },
);
console.log(
  `Created ${output} for ${revision}${status ? " (dirty WP9-A test only)" : ""}.`,
);
