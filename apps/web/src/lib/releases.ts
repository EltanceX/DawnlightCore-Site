import { z } from "zod";
import feedSource from "../../../../content/releases/releases.json";

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const httpsUrlSchema = z.string().url().startsWith("https://");

const locationSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(512),
  region: z.enum(["global", "china", "other"]),
  url: httpsUrlSchema,
});

const artifactSchema = z.object({
  id: idSchema,
  platform: z.enum(["windows", "android", "linux", "ios", "web"]),
  architecture: z.enum(["x64", "arm64", "wasm", "universal"]),
  variant: z.string().min(1).max(512),
  fileName: z
    .string()
    .regex(/^[^/\\]+$/)
    .min(1)
    .max(240),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  graphics: z.object({
    api: z.string().min(1).max(512),
    minimumVersion: z.string().min(1).max(512).optional(),
    features: z.array(z.string().min(1).max(512)),
  }),
  primary: locationSchema,
  mirrors: z.array(locationSchema),
  signature: z
    .object({
      algorithm: z.literal("ed25519"),
      keyId: z.string().min(1).max(512),
      url: httpsUrlSchema,
    })
    .optional(),
});

const releaseSchema = z.object({
  id: idSchema,
  version: z.string().min(1).max(512),
  channel: z.enum(["stable", "beta", "nightly"]),
  status: z.enum(["available", "withdrawn", "archived"]),
  publishedAt: z.string().datetime(),
  summary: z.string().min(1).max(1024),
  coreApiVersion: z.string().min(1).max(512).optional(),
  supportedManifestVersions: z.array(z.number().int().positive()).min(1),
  docsVersion: z.string().min(1).max(512),
  releaseNotes: z.string().regex(/^[^/].*\.md$/),
  artifacts: z.array(artifactSchema).min(1),
});

export const releaseFeedSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  signingKeyId: z.string().min(1).max(512).optional(),
  releases: z.array(releaseSchema),
});

export type ReleaseFeed = z.infer<typeof releaseFeedSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Platform = Artifact["platform"];
export type Architecture = Artifact["architecture"];
export type Channel = Release["channel"];

export const releaseFeed = releaseFeedSchema.parse(feedSource);

export type ArtifactSelection = {
  channel?: Channel;
  platform?: Platform;
  architecture?: Architecture;
  variant?: string;
};

export type Recommendation = {
  artifact?: Artifact;
  release?: Release;
  alternatives: Artifact[];
  reason: string;
  state: "available" | "no-release" | "no-match";
};

function latestAvailableRelease(feed: ReleaseFeed, channel?: Channel) {
  return feed.releases
    .filter(
      (release) =>
        release.status === "available" &&
        (channel ? release.channel === channel : true),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
}

export function recommendArtifact(
  feed: ReleaseFeed,
  selection: ArtifactSelection = {},
): Recommendation {
  const release = latestAvailableRelease(feed, selection.channel);
  if (!release) {
    return {
      alternatives: [],
      reason: "当前没有可用的官方 release。",
      state: "no-release",
    };
  }

  const { channel: _channel, ...artifactSelection } = selection;
  const candidates = release.artifacts.filter((artifact) =>
    Object.entries(artifactSelection).every(([key, value]) =>
      value ? artifact[key as keyof Artifact] === value : true,
    ),
  );
  const artifact = candidates[0];
  if (!artifact) {
    return {
      release,
      alternatives: release.artifacts,
      reason: `没有匹配 ${selection.platform ?? "平台"} ${selection.architecture ?? "架构"} 的 artifact，请手动选择。`,
      state: "no-match",
    };
  }

  return {
    artifact,
    release,
    alternatives: candidates.slice(1),
    reason: `${artifact.platform} ${artifact.architecture}，${artifact.graphics.api}`,
    state: "available",
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
