import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, sep, posix } from "node:path";

const docsRoot = resolve("apps/web/content/docs");
const contractRoot = resolve("contracts/dawnlight/preview");
const contractLock = JSON.parse(
  readFileSync(resolve(contractRoot, "contract-lock.json"), "utf8"),
);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.endsWith(".mdx")) files.push(fullPath);
  }
}

walk(docsRoot);
const requiredSlugs = [
  "00-overview/introduction",
  "00-overview/capabilities-and-limitations",
  "01-getting-started/prerequisites",
  "01-getting-started/first-minimal-pack",
  "01-getting-started/validate-with-cli",
  "02-concepts/package-model",
  "02-concepts/trusted-catalog-boundary",
  "02-concepts/generation-and-lifecycle",
  "03-manifest/root-and-fragments",
  "03-manifest/options",
  "03-manifest/programs",
  "03-manifest/defines-and-variants",
  "03-manifest/resources",
  "03-manifest/passes-and-commands",
  "03-manifest/semantics-and-bindings",
  "04-settings-ui/overview",
  "04-settings-ui/pages-groups-controls",
  "04-settings-ui/conditions",
  "04-settings-ui/localization",
  "05-guides/fullscreen-pass",
  "05-guides/compute-pass",
  "05-guides/history-resource",
  "05-guides/complete-pack-roadmap",
  "06-reference/manifest-fields",
  "06-reference/command-types",
  "06-reference/diagnostics",
  "06-reference/limits",
  "07-migration/version-policy",
];
function slugForFile(file) {
  return relative(docsRoot, file)
    .replaceAll(sep, "/")
    .replace(/\.mdx$/, "")
    .replace(/^index$/, "")
    .replace(/\/index$/, "");
}

const routes = new Set(
  files.map((file) => {
    const slug = slugForFile(file);
    return `/zh-CN/docs/preview${slug ? `/${slug}` : ""}`;
  }),
);
function routeForFile(file) {
  const slug = slugForFile(file);
  return `/zh-CN/docs/preview${slug ? `/${slug}` : ""}`;
}
const knownSources = new Set(contractLock.files.map((file) => file.path));
const errors = [];
const discoveredSlugs = new Set(files.map(slugForFile));
for (const slug of requiredSlugs) {
  if (!discoveredSlugs.has(slug))
    errors.push(`missing launch document ${slug}`);
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const label = relative(process.cwd(), file);
  if (/([A-Za-z]:\\|\/Users\/|\/home\/|E:\\sc\\)/i.test(text)) {
    errors.push(`${label}: contains an absolute local path`);
  }

  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    errors.push(`${label}: missing frontmatter`);
    continue;
  }
  if (!/^title:\s*.+$/m.test(frontmatter[1])) {
    errors.push(`${label}: missing title`);
  }
  const verified = frontmatter[1]
    .match(/^lastVerifiedWith:\s*(.+)$/m)?.[1]
    .trim();
  if (!verified || !contractLock.source.commit.startsWith(verified)) {
    errors.push(`${label}: lastVerifiedWith does not match contract lock`);
  }
  const refs = [...frontmatter[1].matchAll(/^\s*-\s+([^\n]+)$/gm)].map(
    (match) => match[1].trim(),
  );
  for (const ref of refs.filter((value) => value.includes("/"))) {
    if (!knownSources.has(ref) && !ref.startsWith("http")) {
      errors.push(`${label}: unknown sourceRef ${ref}`);
    }
  }

  for (const match of text.matchAll(/\]\((\/zh-CN\/docs\/preview[^)#]*)/g)) {
    const target = match[1].replace(/\/$/, "");
    if (!routes.has(target))
      errors.push(`${label}: unknown internal link ${target}`);
  }

  const currentRoute = routeForFile(file);
  for (const match of text.matchAll(/\]\((\.{1,2}\/[^)#]*)/g)) {
    const targetPath = posix.normalize(
      posix.join(`${currentRoute}/`, match[1]),
    );
    const target = targetPath.replace(/\/index$/, "").replace(/\/$/, "");
    if (!routes.has(target)) {
      errors.push(`${label}: unknown relative link ${match[1]}`);
    }
  }
}

const slugs = [...routes];
if (new Set(slugs).size !== slugs.length)
  errors.push("duplicate document slug");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Docs validation passed (${files.length} MDX pages, ${routes.size} routes).`,
);
