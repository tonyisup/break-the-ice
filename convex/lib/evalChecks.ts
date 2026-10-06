import { ConvexError, v } from "convex/values";
import { CURLY_QUOTE, fingerprintText, normalizeQuestion, validateGeneratedQuestion } from "./promptArchitecture";
import { taxonomyDefinition } from "./taxonomyDefinitions";

/**
 * Evals spend AI budget and write generation runs, so they only run where a deployment opts in
 * (EVALS_ENABLED=true, set on dev only). Every deployment gets these functions.
 */
export function assertEvalsEnabled(): void {
  if (process.env.EVALS_ENABLED !== "true") {
    throw new ConvexError({
      code: "EVALS_DISABLED",
      message: "Evals are off on this deployment. Set EVALS_ENABLED=true on the dev deployment to run them.",
    });
  }
}

/** The short style, tone and topic definitions Jev grades fit against. */
export const evalDefinitionsResult = v.object({ style: taxonomyDefinition, tone: taxonomyDefinition, topic: v.union(v.null(), taxonomyDefinition) });

export type EvalPipelineOutcome = "saved" | "duplicate" | "rejected";

export type EvalCandidateCheck = {
  text: string;
  /** Whether the model's text had curly quotes before normalizeQuestion straightened them. */
  hadCurlyQuotes: boolean;
  fingerprint: string;
  /** What the save step would do with this candidate. */
  outcome: EvalPipelineOutcome;
  duplicateOf: "batch" | "library" | null;
  codeRejections: string[];
};

/**
 * The checks `insertGeneratedQuestions` runs before saving, in the same order: an exact copy
 * earlier in the batch, then an exact copy already in the library, then the code checks. The
 * eval harness uses this to report what the save step would have kept without saving anything.
 */
export function checkEvalCandidates(texts: string[], libraryFingerprints: ReadonlySet<string>): EvalCandidateCheck[] {
  const seen = new Set<string>();
  return texts.map((raw) => {
    const text = normalizeQuestion(raw);
    const fingerprint = evalFingerprint(raw);
    const codeRejections = validateGeneratedQuestion(text);
    let duplicateOf: EvalCandidateCheck["duplicateOf"] = null;
    if (seen.has(fingerprint)) {
      duplicateOf = "batch";
    } else if (libraryFingerprints.has(fingerprint)) {
      duplicateOf = "library";
    }
    seen.add(fingerprint);
    const outcome: EvalPipelineOutcome = duplicateOf ? "duplicate" : codeRejections.length > 0 ? "rejected" : "saved";
    return { text, hadCurlyQuotes: CURLY_QUOTE.test(raw), fingerprint, outcome, duplicateOf, codeRejections };
  });
}

/** The fingerprint the save step would give a generated question. */
export function evalFingerprint(text: string): string {
  return fingerprintText(normalizeQuestion(text));
}
