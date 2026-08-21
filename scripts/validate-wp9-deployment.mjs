import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const read = (path) => readFileSync(resolve(path), "utf8");
const fail = (message) => {
  console.error(`WP9 deployment validation failed: ${message}`);
  process.exit(1);
};

const composePath = "infra/compose/wp9-a.compose.yml";
const composeText = read(composePath);
const compose = parseYaml(composeText);
const services = compose?.services ?? {};
const digestPattern = /@sha256:[0-9a-f]{64}$/;
const caddy = read("infra/compose/wp9-a.Caddyfile");
const tlsComposePath = "infra/compose/wp9-a-tls.compose.yml";
const tlsComposeText = read(tlsComposePath);
const tlsCompose = parseYaml(tlsComposeText);
const tlsCaddy = read("infra/compose/wp9-a-tls.Caddyfile");
const docsSearchRoute = caddy.indexOf("@docs_search path /api/search");
const apiRoute = caddy.indexOf("@api path /api/*");
if (
  docsSearchRoute < 0 ||
  apiRoute < 0 ||
  docsSearchRoute > apiRoute ||
  !caddy.slice(docsSearchRoute, apiRoute).includes("reverse_proxy web:8080")
) {
  fail("static documentation search must route to Web before the API wildcard");
}
const tlsEdge = tlsCompose?.services?.["tls-edge"];
if (!tlsEdge) fail("TLS overlay is missing tls-edge");
if (!digestPattern.test(tlsEdge.image ?? "")) {
  fail("TLS edge must use a digest-pinned external image");
}
for (const marker of [
  "http://{$WP9_PUBLIC_HOST}",
  "https://{$WP9_PUBLIC_HOST}",
  "tls /run/dawnlight-tls/tls.crt /run/dawnlight-tls/tls.key",
  "redir https://{$WP9_PUBLIC_HOST}{uri} permanent",
  "@docs_search path /api/search",
  "@api path /api/* /health/* /artifacts/*",
  'X-Content-Type-Options "nosniff"',
  'X-Robots-Tag "noindex, nofollow"',
  "Content-Security-Policy-Report-Only",
]) {
  if (!tlsCaddy.includes(marker)) fail(`TLS edge config is missing ${marker}`);
}
if (tlsCaddy.includes("Strict-Transport-Security")) {
  fail("disposable Preview TLS edge must not emit Production HSTS");
}
if (
  tlsCaddy.indexOf("@docs_search path /api/search") >
  tlsCaddy.indexOf("@api path /api/*")
) {
  fail(
    "TLS edge must route static documentation search before the API wildcard",
  );
}
for (const target of [
  "/run/dawnlight-tls/tls.crt",
  "/run/dawnlight-tls/tls.key",
]) {
  const volume = tlsEdge.volumes?.find((entry) => entry?.target === target);
  if (!volume?.read_only || volume.bind?.create_host_path !== false) {
    fail(`TLS edge must bind existing ${target} read-only`);
  }
}
if (
  tlsEdge.read_only !== true ||
  tlsEdge.user !== "65532:65532" ||
  !tlsEdge.cap_drop?.includes("ALL") ||
  !tlsEdge.cap_add?.includes("NET_BIND_SERVICE") ||
  !tlsEdge.security_opt?.includes("no-new-privileges:true")
) {
  fail("TLS edge must retain the non-root read-only Caddy boundary");
}
const requiredServices = [
  "postgres",
  "minio",
  "minio-init",
  "oidc",
  "web",
  "migrate",
  "validator-workspace-init",
  "api",
  "worker",
  "bootstrap-admin",
  "edge",
];
for (const name of requiredServices) {
  if (!services[name]) fail(`compose is missing ${name}`);
}

for (const name of ["postgres", "minio", "minio-init", "oidc", "edge"]) {
  if (!digestPattern.test(services[name].image ?? "")) {
    fail(`${name} must use a digest-pinned external image`);
  }
}

for (const [name, target] of [
  ["web", "web"],
  ["api", "api"],
  ["worker", "worker"],
]) {
  const service = services[name];
  if (service.build?.target !== target) {
    fail(`${name} must build the ${target} target`);
  }
  if (service.read_only !== true)
    fail(`${name} root filesystem must be read-only`);
  if (!service.cap_drop?.includes("ALL"))
    fail(`${name} must drop all capabilities`);
  if (!service.security_opt?.includes("no-new-privileges:true")) {
    fail(`${name} must set no-new-privileges`);
  }
}

for (const [name, service] of Object.entries(services)) {
  if (service.ports && !new Set(["edge", "oidc"]).has(name)) {
    fail(`${name} must not publish host ports`);
  }
}
for (const name of ["web", "edge"]) {
  if (!services[name].cap_add?.includes("NET_BIND_SERVICE")) {
    fail(`${name} must add only the Caddy bind-service capability`);
  }
}
for (const name of ["api", "worker"]) {
  if (services[name].cap_add?.length) {
    fail(`${name} must not add capabilities back`);
  }
}
if (compose.networks?.private?.internal !== true) {
  fail("private network must be internal");
}
if (
  !services.oidc.networks?.includes("public") ||
  !services.oidc.networks?.includes("private")
) {
  fail("mock OIDC must be published through public and remain API-reachable");
}
for (const name of ["postgres", "minio"]) {
  if (services[name].networks?.includes("public")) {
    fail(`${name} must remain private-only`);
  }
}
if (services.api.deploy?.replicas && services.api.deploy.replicas !== 1) {
  fail("WP9-A is frozen to one API replica");
}
if (
  services.worker.environment?.TMPDIR !==
  "${WP9_VALIDATOR_WORKSPACE_ROOT:?required}"
) {
  fail(
    "worker TMPDIR must use the same absolute host path as Validator bind mounts",
  );
}
if (
  !services.worker.volumes?.some(
    (volume) =>
      volume?.source === "/var/run/docker.sock" &&
      volume?.target === "/var/run/docker.sock",
  )
) {
  fail("worker must declare the WP9-A Docker socket boundary");
}
if (!services.worker.group_add?.includes("${WP9_DOCKER_GID:?required}")) {
  fail("worker must use the host Docker socket group");
}
const workspaceVolume = services.worker.volumes?.find(
  (volume) =>
    volume?.source === "${WP9_VALIDATOR_WORKSPACE_ROOT:?required}" &&
    volume?.target === "${WP9_VALIDATOR_WORKSPACE_ROOT:?required}",
);
if (!workspaceVolume || workspaceVolume.bind?.create_host_path !== false) {
  fail("Validator workspace must pre-exist instead of being root-created");
}
if (!services["bootstrap-admin"].profiles?.includes("operator")) {
  fail("bootstrap admin must remain an explicit operator profile");
}
if (
  services.worker.environment?.LOADER_VALIDATOR_ENABLED !== undefined ||
  !composeText.includes(
    "LOADER_VALIDATOR_ENABLED: ${WP9_VALIDATOR_ENABLED:-false}",
  )
) {
  fail("Validator must remain disabled until an explicit digest is supplied");
}

for (const path of [
  "infra/images/Dockerfile.web",
  "infra/images/Dockerfile.services",
]) {
  const dockerfile = read(path);
  if (!dockerfile.includes("@sha256:") || dockerfile.includes(":latest")) {
    fail(`${path} must pin base images and must not use latest`);
  }
  for (const label of [
    "org.opencontainers.image.created",
    "org.opencontainers.image.revision",
    "org.opencontainers.image.source",
    "org.opencontainers.image.version",
  ]) {
    if (!dockerfile.includes(label)) fail(`${path} is missing ${label}`);
  }
}
if (!read("infra/images/Dockerfile.web").includes("USER 65532:65532")) {
  fail("Web image must run as numeric non-root");
}
const serviceDockerfile = read("infra/images/Dockerfile.services");
if (!serviceDockerfile.includes("USER 10001:10001")) {
  fail("API and Worker images must run as numeric non-root");
}
if (!serviceDockerfile.includes("COPY --from=docker-cli")) {
  fail(
    "Worker image must contain the pinned Docker CLI used by Validator isolation",
  );
}
for (const marker of [
  "/deploy/shared/zod",
  "/app/node_modules/@dawnlight/config",
  "/app/node_modules/@dawnlight/contract-data",
  "/app/node_modules/@dawnlight/database",
]) {
  if (!serviceDockerfile.includes(marker)) {
    fail(
      `service images must materialize runtime workspace dependency ${marker}`,
    );
  }
}

const envExample = read("infra/compose/wp9-a.env.example");
for (const marker of [
  "WP9_IMAGE_REVISION=<40-character-clean-commit>",
  "WP9_RELEASE_FEED_SIGNING_PRIVATE_KEY_PEM_BASE64=<generated>",
  "WP9_VALIDATOR_ENABLED=false",
]) {
  if (!envExample.includes(marker))
    fail(`environment template is missing ${marker}`);
}
if (!read(".gitignore").includes("infra/compose/wp9-a.env")) {
  fail("generated WP9-A environment file must be ignored");
}

console.log(
  "WP9-1 deployment definitions passed (three OCI targets, pinned bases, isolated single-instance Compose).",
);
