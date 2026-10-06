import { v, type Infer } from "convex/values";
import { editorialReason } from "./questionReviewValidators";
import type { TaxonomyDefinition } from "./taxonomyDefinitions";

// The quality check: one model call that judges a generated question against the owner's
// labeling rubric. This file is the pure part: the instructions, the answer parser and the
// publish rule. The call itself is in internal/qualityCheck.ts.

// The only model measured against the owner's labels (evals/README.md). Named here, like
// GENERATION_MODEL, so a change shows in a diff and on every check's run.
export const QUALITY_CHECK_MODEL = "anthropic/claude-opus-5.5";
// Bumped when the instructions or the publish rule change, so verdicts can be told apart.
export const QUALITY_CHECK_PROMPT_VERSION = 1;
export const QUALITY_CHECK_TEMPERATURE = 0;
// The answer is one small JSON object, under 100 tokens. Opus 5.5 spends a few hundred hidden
// reasoning tokens before it, and they count toward the cap: at 400, 18 of 60 answers on dev
// came back cut off or empty. The longest of 180 measured there was 457 tokens.
export const QUALITY_CHECK_MAX_OUTPUT_TOKENS = 1200;
const MAX_NOTE_CHARS = 200;
const MIN_PUBLISH_CONFIDENCE = 5;

export const QUALITY_REASONS = ["awkward_wording", "unclear_answer", "style_tone_mismatch", "repeated_construction"] as const;
export const QUALITY_SAFETY_FLAGS = ["trauma", "targets_person", "sexual_illegal", "politics_religion", "humiliation"] as const;
export type QualityReason = (typeof QUALITY_REASONS)[number];
export type QualitySafetyFlag = (typeof QUALITY_SAFETY_FLAGS)[number];

export type QualityVerdict = {
  verdict: "keep" | "hold";
  reasons: QualityReason[];
  safety: QualitySafetyFlag[];
  /** 1 to 5: how sure the judge is of its verdict. */
  confidence: number;
  note: string;
};

export const qualityVerdict = v.object({
  verdict: v.union(v.literal("keep"), v.literal("hold")),
  reasons: v.array(editorialReason),
  safety: v.array(v.string()),
  confidence: v.number(),
  note: v.string(),
});

/** What a check leaves on a question. */
export const qualityCheckSnapshot = v.object({
  ...qualityVerdict.fields,
  wouldPublish: v.boolean(),
  model: v.string(),
  promptVersion: v.number(),
  runId: v.id("generationRuns"),
  checkedAt: v.number(),
});
export type QualityCheckSnapshot = Infer<typeof qualityCheckSnapshot>;

export type QualityCheckMode = "off" | "record" | "publish";

/**
 * QUALITY_CHECK_MODE on this deployment: `off` (the default) schedules no checks, `record`
 * saves a verdict on every generated question and changes nothing else. `publish` is
 * accepted, and behaves as `record` until publishing is built.
 */
export function qualityCheckMode(): QualityCheckMode {
  const value = process.env.QUALITY_CHECK_MODE?.trim();
  return value === "record" || value === "publish" ? value : "off";
}

export type QualityCheckSubject = {
  text: string;
  style: TaxonomyDefinition;
  tone: TaxonomyDefinition;
  topic: TaxonomyDefinition | null;
};

// The owner's labeling rubric, for one question at a time. The verdict and the confidence
// answer two different questions on purpose. A hold is shown to people as a flag, so it has to
// be right when it appears: "most decent questions should be keeps" is what stops the judge
// from holding questions the owner likes. Publishing unread is a higher bar than a keep, and
// the confidence carries it (wouldPublish). The anchors for 4 and 5 are what separate the two
// on the owner's labels, so reword them only with a new measurement (evals/README.md).
const SYSTEM_PROMPT = `You are an expert editor reviewing one icebreaker question for the Break the Ice app. Questions appear one at a time in a public feed, in a daily email, and on a gym's whiteboard, where a coach reads the question of the day aloud to adults in class. A good question is quick to understand, invites a short story or a real answer, is comfortable to answer in front of acquaintances, and fits its style and tone.

Decide:
- verdict: "keep" (it belongs in the public library) or "hold" (it has a problem an editor would send it back for).
- reasons (only when the verdict is "hold"; one or more):
  - awkward_wording: clunky, unnatural, confusing grammar, or two questions joined into one.
  - unclear_answer: hard to tell what a good answer looks like; needs niche expertise or private facts; invites only a one-word answer when the style doesn't ask for one; too vague or generic to spark anything.
  - style_tone_mismatch: doesn't follow its style's structure or its tone's register, as they are described with the question. A question with a topic should also be about that topic.
  - repeated_construction: a formulaic sentence frame that reads as a template, where this question adds little beyond the frame. A familiar opener alone is not enough.
- safety (any question; zero or more):
  - trauma: invites trauma, grief, illness or a painful memory.
  - targets_person: asks to judge or expose a specific real person.
  - sexual_illegal: sexual content, drugs or crime.
  - politics_religion: asks for a political or religious position.
  - humiliation: an honest answer would embarrass someone in front of colleagues or classmates.
- confidence: a whole number from 1 to 5.
  For a keep, it says whether the question can be published exactly as written with nobody reading it first. 5: yes, and you would be glad to be asked it. 4: yes. 3: a decent question that a person should still read first. 1 or 2: a guess.
  A keep earns 4 or 5 only if it passes all three of these tests. If any fails, the keep is a 3.
  1. A coach could read it aloud once, without stumbling, and everyone would know what is being asked. Length alone doesn't fail this: a long question built around one concrete choice passes. A long scene to hold in mind before the ask arrives does not.
  2. You can name a good answer of your own within a few seconds.
  3. It asks for one thing, not for a thing and then what it changed, taught or meant.
  For a hold, it says how sure you are that the problem is real. 5: certain. 3: it could go either way.
- note: one sentence of at most ${MAX_NOTE_CHARS} characters saying why, in plain words for someone who hasn't read these instructions. For a keep below 5, say what gave you pause.

Be a demanding but fair editor: most decent questions should be keeps, and you hold one only when a real editor would. Doubt about a decent question makes it a keep at 3, not a hold.

Answer with one JSON object and nothing else:
{"verdict": "keep" or "hold", "reasons": [], "safety": [], "confidence": 4, "note": ""}
The only reasons are ${QUALITY_REASONS.join(", ")}. The only safety flags are ${QUALITY_SAFETY_FLAGS.join(", ")}. A keep has no reasons.`;

/** The judge sees the question and what it was asked to be. It never sees the generator's own rationale. */
export function buildQualityCheckPrompts(subject: QualityCheckSubject): { systemPrompt: string; userPrompt: string } {
  const userPrompt = [
    `Style: ${subject.style.name}`,
    subject.style.definition,
    "",
    `Tone: ${subject.tone.name}`,
    subject.tone.definition,
    "",
    subject.topic ? `Topic: ${subject.topic.name}${subject.topic.definition ? `. ${subject.topic.definition}` : ""}` : "Topic: none",
    "",
    "Question:",
    subject.text,
  ].join("\n");
  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

function knownValues<T extends string>(value: unknown, known: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<T>();
  for (const item of value) {
    if (typeof item !== "string" || !(known as readonly string[]).includes(item)) return null;
    seen.add(item as T);
  }
  return [...seen];
}

/**
 * Reads the judge's answer. Null for anything that isn't the object asked for: not JSON, a
 * verdict or confidence out of range, or a reason or safety category outside the lists. A
 * misread verdict must never count as a keep.
 */
export function parseQualityVerdict(raw: string): QualityVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const answer = parsed as Record<string, unknown>;
  if (answer.verdict !== "keep" && answer.verdict !== "hold") return null;
  const reasons = knownValues(answer.reasons, QUALITY_REASONS);
  const safety = knownValues(answer.safety, QUALITY_SAFETY_FLAGS);
  if (!reasons || !safety) return null;
  const confidence = answer.confidence;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 1 || confidence > 5) return null;
  if (typeof answer.note !== "string") return null;
  return { verdict: answer.verdict, reasons, safety, confidence, note: answer.note.trim().slice(0, MAX_NOTE_CHARS) };
}

/**
 * What a team's managers are shown about a question nobody has reviewed: the check held it or
 * raised a safety concern. An admin's review of the question settles it, so the flag goes.
 */
export function claudeFlag(question: {
  qualityCheck?: QualityCheckSnapshot;
  reviewRevision?: number;
}): Pick<QualityCheckSnapshot, "reasons" | "safety" | "note"> | undefined {
  const check = question.qualityCheck;
  if (!check || (question.reviewRevision ?? 0) > 0) return undefined;
  if (check.verdict !== "hold" && check.safety.length === 0) return undefined;
  return { reasons: check.reasons, safety: check.safety, note: check.note };
}

/**
 * Whether a verdict is clear enough to publish a question without the owner seeing it: a keep
 * at the top confidence only. On 60 questions the owner had labeled (dev, Oct 2026), the owner
 * rejected about 1 in 5 of the keeps at 4 or above, and 1 of the 17 at 5.
 */
export function wouldPublish(verdict: QualityVerdict): boolean {
  return (
    verdict.verdict === "keep" &&
    verdict.reasons.length === 0 &&
    verdict.safety.length === 0 &&
    verdict.confidence >= MIN_PUBLISH_CONFIDENCE
  );
}
