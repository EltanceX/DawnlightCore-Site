import { describe, expect, it } from "vitest";
import {
  recommendArtifact,
  releaseFeedSchema,
  type ReleaseFeed,
} from "@/lib/releases";

const availableFeed: ReleaseFeed = releaseFeedSchema.parse({
  schemaVersion: 1,
  generatedAt: "2026-08-17T00:00:00Z",
  releases: [
    {
      id: "preview-1",
      version: "0.1.0-preview.1",
      channel: "beta",
      status: "available",
      publishedAt: "2026-08-16T00:00:00Z",
      summary: "Preview build",
      supportedManifestVersions: [3],
      docsVersion: "preview",
      releaseNotes: "releases/preview-1.md",
      artifacts: [
        {
          id: "windows-x64",
          platform: "windows",
          architecture: "x64",
          variant: "default",
          fileName: "dawnlightcore-win-x64.zip",
          size: 1024,
          sha256: "a".repeat(64),
          graphics: { api: "DirectX 11", features: [] },
          primary: {
            id: "github",
            label: "GitHub Releases",
            region: "global",
            url: "https://example.com/dawnlightcore.zip",
          },
          mirrors: [],
        },
      ],
    },
  ],
});

describe("release feed recommendation", () => {
  it("reports the preview empty feed without inventing an artifact", () => {
    expect(
      recommendArtifact(
        releaseFeedSchema.parse({
          schemaVersion: 1,
          generatedAt: "2026-08-17T00:00:00Z",
          releases: [],
        }),
      ).state,
    ).toBe("no-release");
  });

  it("selects an exact platform and architecture", () => {
    const result = recommendArtifact(availableFeed, {
      channel: "beta",
      platform: "windows",
      architecture: "x64",
    });
    expect(result.state).toBe("available");
    expect(result.artifact?.id).toBe("windows-x64");
  });

  it("returns alternatives instead of treating a mismatch as compatible", () => {
    const result = recommendArtifact(availableFeed, {
      channel: "beta",
      platform: "android",
      architecture: "arm64",
    });
    expect(result.state).toBe("no-match");
    expect(result.artifact).toBeUndefined();
    expect(result.alternatives).toHaveLength(1);
  });
});
