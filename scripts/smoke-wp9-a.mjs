const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument?.startsWith("--"))
    args.set(argument.slice(2), process.argv[index + 1]);
}

const publicOrigin = args.get("public-origin") ?? process.env.WP9_PUBLIC_ORIGIN;
const oidcOrigin = args.get("oidc-origin") ?? process.env.WP9_OIDC_ORIGIN;
if (!publicOrigin || !oidcOrigin) {
  throw new Error("Provide --public-origin and --oidc-origin.");
}

const checks = [
  [publicOrigin, "/", 200],
  [publicOrigin, "/zh-CN/", 200],
  [publicOrigin, "/zh-CN/author/", 200],
  [publicOrigin, "/health/live", 200],
  [publicOrigin, "/health/ready", 200],
  [publicOrigin, "/api/v1/contracts", 200],
  [publicOrigin, "/api/v1/search?q=dawnlight", 200],
  [publicOrigin, "/artifacts/wp9-a-missing.zip", 404],
  [oidcOrigin, "/isalive", 200],
  [oidcOrigin, "/dawnlight/.well-known/openid-configuration", 200],
];
const failures = [];
for (const [origin, path, expected] of checks) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    if (response.status !== expected) {
      failures.push(`${origin}${path}: ${response.status} != ${expected}`);
    }
  } catch (error) {
    failures.push(
      `${origin}${path}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

const discoveryResponse = await fetch(
  new URL("/dawnlight/.well-known/openid-configuration", oidcOrigin),
);
if (discoveryResponse.ok) {
  const discovery = await discoveryResponse.json();
  if (discovery.issuer !== `${oidcOrigin}/dawnlight`) {
    failures.push(
      `OIDC issuer ${discovery.issuer} does not match ${oidcOrigin}/dawnlight`,
    );
  }
}

if (failures.length > 0) {
  console.error(`WP9-A smoke failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("WP9-A Web/API/OIDC smoke passed.");
