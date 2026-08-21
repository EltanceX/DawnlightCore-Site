import type {
  OperationsDataService,
  TakedownEvidenceCandidate,
} from "@dawnlight/database";
import type { TakedownEvidenceStorage } from "./storage.js";

type EvidenceOperations = Pick<
  OperationsDataService,
  "completeTakedownEvidence" | "recordTakedownEvidenceFailure"
>;

export async function retainTakedownEvidence(
  candidate: TakedownEvidenceCandidate,
  storage: TakedownEvidenceStorage,
  operations: EvidenceOperations,
  finalAttempt: boolean,
) {
  try {
    await storage.retainPublishedEvidence(
      candidate.sourceObjectKey,
      candidate.evidenceObjectKey,
      candidate.sha256,
      candidate.size,
    );
    await operations.completeTakedownEvidence(
      candidate.decisionId,
      candidate.evidenceObjectKey,
    );
  } catch (error) {
    await operations.recordTakedownEvidenceFailure(
      candidate.decisionId,
      error instanceof Error ? error.message : "Evidence retention failed",
      finalAttempt,
    );
    throw error;
  }
}
