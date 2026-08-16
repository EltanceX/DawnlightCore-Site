import { describe, expect, it } from "vitest";
import { contractExamples, developerContract } from "@/lib/contract";

describe("developer contract snapshot", () => {
  it("exposes the locked preview commit to the web consumer", () => {
    expect(developerContract.metadata.status).toBe("preview");
    expect(developerContract.lock.source.commit).toBe(
      "3ec28fc9461e6b1636ad4adc086e9cea8150c02e",
    );
    expect(developerContract.lock.publicApiStatus).toBe("preview-only");
  });

  it("keeps the verified minimal example available without a Core path", () => {
    expect(contractExamples.minimal).toContain('"manifestVersion": 3');
    expect(
      developerContract.verification.examples.map((example) => example.id),
    ).toEqual(["minimal", "settings-auto", "settings-authored"]);
  });
});
