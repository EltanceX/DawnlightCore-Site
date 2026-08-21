import { describe, expect, it, vi } from "vitest";
import { retainTakedownEvidence } from "./takedown.js";

const candidate = {
  decisionId: "11111111-1111-4111-8111-111111111111",
  sourceObjectKey: "shaderpacks/test/1.0/hash.zip",
  evidenceObjectKey:
    "takedown-evidence/11111111-1111-4111-8111-111111111111/hash.zip",
  sha256: "a".repeat(64),
  size: 1024,
};

describe("takedown evidence retention", () => {
  it("records completion only after verified storage retention", async () => {
    const storage = { retainPublishedEvidence: vi.fn(async () => {}) };
    const operations = {
      completeTakedownEvidence: vi.fn(async () => {}),
      recordTakedownEvidenceFailure: vi.fn(async () => {}),
    };

    await retainTakedownEvidence(candidate, storage, operations, false);

    expect(storage.retainPublishedEvidence).toHaveBeenCalledWith(
      candidate.sourceObjectKey,
      candidate.evidenceObjectKey,
      candidate.sha256,
      candidate.size,
    );
    expect(operations.completeTakedownEvidence).toHaveBeenCalledWith(
      candidate.decisionId,
      candidate.evidenceObjectKey,
    );
    expect(operations.recordTakedownEvidenceFailure).not.toHaveBeenCalled();
  });

  it("keeps a failed evidence operation visible for retry", async () => {
    const failure = new Error("copy failed");
    const storage = {
      retainPublishedEvidence: vi.fn(async () => {
        throw failure;
      }),
    };
    const operations = {
      completeTakedownEvidence: vi.fn(async () => {}),
      recordTakedownEvidenceFailure: vi.fn(async () => {}),
    };

    await expect(
      retainTakedownEvidence(candidate, storage, operations, true),
    ).rejects.toThrow("copy failed");
    expect(operations.recordTakedownEvidenceFailure).toHaveBeenCalledWith(
      candidate.decisionId,
      "copy failed",
      true,
    );
  });
});
