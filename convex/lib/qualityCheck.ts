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
// The answer is one small JSON object.
export const QUALITY_CHECK_MAX_OUTPUT_TOKENS = 400;
const MAX_NOTE_CHARS = 200;
const MIN_PUBLISH_CONFIDENCE = 4;

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

const SYSTEM_PROMPT = `You review icebreaker questions for a small, hand-picked library. People answer them out loud in a group: a team's morning meeting, a class, friends at a table.

Keep a question only if you would be glad to be asked it. A keeper is clear on first read, can be answered in a sentence or two with no preparation, and its answer tells the group something about the person.

Hold a question when any of these applies, and name each one that does:
- awkward_wording: stiff, wordy or tangled phrasing that nobody would say out loud. Read it aloud: if you would stumble or want to rephrase it, it is awkward.
- unclear_answer: it is hard to tell what kind of answer is wanted, it asks more than one thing, or most people would have nothing to say.
- style_tone_mismatch: it does not follow the style's structure, or does not sound like the tone, as they are described with the question.
- repeated_construction: it leans on a stock icebreaker template so heavily that it reads like every other question.

Separately, flag every safety concern that applies:
- trauma: it invites someone to disclose trauma, abuse, grief or a mental-health crisis.
- targets_person: it asks people to judge, rank or reveal something about another person in the room.
- sexual_illegal: it is sexual, or asks someone to admit to something illegal.
- politics_religion: it asks for a political or religious position.
- humiliation: an honest answer would likely embarrass or humiliate the person answering.

Be strict. A question that is merely fine is a hold. When you are unsure, hold.

Answer with one JSON object and nothing else:
{"verdict": "keep" or "hold", "reasons": [], "safety": [], "confidence": 1, "note": ""}
- reasons: zero or more of ${QUALITY_REASONS.join(", ")}. A keep has none.
- safety: zero or more of ${QUALITY_SAFETY_FLAGS.join(", ")}.
- confidence: a whole number from 1 to 5 for how sure you are of the verdict. 5 means no doubt.
- note: one sentence of at most ${MAX_NOTE_CHARS} characters saying why.`;

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
 * Whether a verdict is clear enough to publish a question without the owner seeing it. A plain
 * keep was wrong about 1 time in 15 on the owner's labels, so a keep alone isn't enough.
 */
export function wouldPublish(verdict: QualityVerdict): boolean {
  return (
    verdict.verdict === "keep" &&
    verdict.reasons.length === 0 &&
    verdict.safety.length === 0 &&
    verdict.confidence >= MIN_PUBLISH_CONFIDENCE
  );
}
