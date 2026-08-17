const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith("--"))
    args.set(value.slice(2), process.argv[index + 1]);
}

const origin = args.get("origin") ?? process.env.SMOKE_ORIGIN;
const mode = args.get("mode") ?? process.env.NEXT_PUBLIC_SITE_MODE ?? "preview";
if (!origin) throw new Error("Provide --origin or SMOKE_ORIGIN.");

const checks = [
  ["/", 200],
  ["/zh-CN/", 200],
  ["/zh-CN/docs/preview/", 200],
  ["/zh-CN/downloads/", 200],
  ["/feeds/releases-v1.json", 200],
  ["/robots.txt", 200],
  ["/sitemap.xml", 200],
  ["/media/hero/dawnlight-preview-wide.webp", 200],
  ["/zh-CN/does-not-exist/", 404],
];
const failures = [];
let rootResponse;

for (const [path, expectedStatus] of checks) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  if (path === "/") rootResponse = response;
  if (response.status !== expectedStatus) {
    failures.push(`${path}: ${response.status} != ${expectedStatus}`);
  }
  if (path === "/feeds/releases-v1.json" && response.ok) {
    const feed = await response.json();
    if (feed.schemaVersion !== 1 || !Array.isArray(feed.releases)) {
      failures.push("release feed is not schemaVersion 1");
    }
  }
}

if (process.env.EXPECT_DEPLOY_HEADERS === "1" && rootResponse) {
  const required = [
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-frame-options",
    "content-security-policy-report-only",
  ];
  for (const name of required) {
    if (!rootResponse.headers.has(name))
      failures.push(`missing header ${name}`);
  }
  if (
    mode === "production" &&
    !rootResponse.headers.has("strict-transport-security")
  ) {
    failures.push("missing production HSTS header");
  }
}

if (failures.length > 0) {
  console.error(`Deployment smoke failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(`Deployment smoke passed for ${origin} (${mode} mode).`);
