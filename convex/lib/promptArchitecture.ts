import { briefEntry } from "./brief";

// The blueprint table is no longer read: the short brief (lib/brief.ts) replaced it. The slug
// is kept for the migration that seeded it.
export const DEFAULT_BLUEPRINT_SLUG = "icebreaker-default";
export const MAX_BATCH_SIZE = 10;

export type PromptExample = { text: string; note?: string };

export type TaxonomyDoc = {
  _id: string;
  slug?: string;
  id?: string;
  version?: number;
  name: string;
  description?: string;
  brief?: string;
  aiGuidance?: string;
  promptGuidanceForAI?: string;
  distinctFrom?: string[];
  examples?: PromptExample[];
  antiExamples?: PromptExample[];
  commonFailureModes?: string[];
};

export type StylePromptDoc = TaxonomyDoc & {
  form?: string;
  structure?: string;
  structuralInstruction?: string;
  cognitiveMove?: string;
  socialFunction?: string;
  answerShape?: string;
};

export type TonePromptDoc = TaxonomyDoc & {
  languageCues?: string[];
  avoidCues?: string[];
};

export type TopicPromptDoc = TaxonomyDoc & {
  scopeBoundaries?: string[];
  referencePool?: string[];
  accessibilityNotes?: string;
};

export function clampBatchSize(value: number) {
  // NaN passes through Math.min and Math.max, and Infinity would come out as the largest batch.
  // The output cap is sized from the result, so a value that isn't a number is one question.
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
}

// Curly quotes are written as escapes. Typed literally, an editor or paste can turn them into
// straight ones, and the replace then does nothing.
/** The curly quotes normalizeQuestion straightens. */
export const CURLY_QUOTE = /[\u2018\u2019\u201C\u201D]/;

export function normalizeQuestion(text: string) {
  return text
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fnv1a(input: string) {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintText(text: string) {
  const normalized = normalizeQuestion(text)
    .toLowerCase()
    .replace(/[`"'.,!;:()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return `q_${fnv1a(normalized)}`;
}

export function validateGeneratedQuestion(text: string) {
  const reasons: string[] = [];
  const questionMarks = (text.match(/\?/g) ?? []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (text.length < 24) reasons.push("too short");
  if (text.length > 220) reasons.push("too long");
  if (wordCount < 6) reasons.push("too few words");
  if (questionMarks !== 1) reasons.push("must contain exactly one question mark");
  if (!text.endsWith("?")) reasons.push("must end with a question mark");
  if (/\n/.test(text)) reasons.push("must be a single card prompt");

  const genericPatterns = [
    /what('?s| is) your favorite /i,
    /^favorite /i,
    /tell me about yourself/i,
    /if you could have any /i,
    /what do you think about /i,
  ];

  if (genericPatterns.some((pattern) => pattern.test(text))) {
    reasons.push("too generic");
  }

  const unsafePatterns = [
    /\bsuicide\b/i,
    /\bself[- ]?harm\b/i,
    /\bmurder\b/i,
    /\btorture\b/i,
    /\bsexual\b/i,
    /\bporn\b/i,
    /\bcrime\b/i,
    /\billegal\b/i,
    /\btrauma\b/i,
  ];

  if (unsafePatterns.some((pattern) => pattern.test(text))) {
    reasons.push("unsafe topic");
  }

  return reasons;
}

export function stripCodeFences(raw: string) {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Extract the first complete JSON object or array from model output. */
export function extractFirstJsonValue(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  const start = cleaned.search(/[\[{]/);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth += 1;
      continue;
    }

    if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return null;
}

type ParsedQuestionItem = { text?: string; rationale?: string } | string;

function normalizeParsedQuestions(parsed: unknown) {
  const questions = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "questions" in parsed
      ? (parsed as { questions?: ParsedQuestionItem[] }).questions
      : undefined;

  if (!Array.isArray(questions)) {
    throw new Error('Model output is missing a "questions" array.');
  }

  return questions
    .map((item) => {
      if (typeof item === "string") return { text: item };
      return {
        text: typeof item?.text === "string" ? item.text : "",
        rationale: typeof item?.rationale === "string" ? item.rationale : undefined,
      };
    })
    .filter((item) => item.text.trim().length > 0);
}

export function parseQuestionObjects(raw: string) {
  const cleaned = stripCodeFences(raw);
  const candidates = [cleaned];
  const extracted = extractFirstJsonValue(cleaned);
  if (extracted && extracted !== cleaned) {
    candidates.push(extracted);
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return normalizeParsedQuestions(JSON.parse(candidate));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Model did not return parseable JSON.");
}

export function parseQuestionTexts(raw: string) {
  return parseQuestionObjects(raw).map((item) => item.text);
}

/**
 * The remix prompt: one question reworded. The style, tone and topic are described by the same
 * line the generator and the judge read (lib/brief.ts).
 */
export function buildRemixPrompts(args: {
  questionText: string;
  style?: StylePromptDoc | null;
  tone?: TonePromptDoc | null;
  topic?: TopicPromptDoc | null;
}) {
  const { questionText, style, tone, topic } = args;

  return {
    systemPrompt: [
      "You are a world-class creative writer specializing in social psychology and ice-breakers.",
      'TASK: Remix the user\'s question. Change the words and phrasing completely.',
      "FORMAT: Return only the new question text as a plain string.",
      style ? `STYLE: ${briefEntry(style)}` : "STYLE: Keep the style of the original text",
      tone ? `TONE: ${briefEntry(tone)}` : "TONE: Keep the tone of the original text",
      topic ? `TOPIC: ${briefEntry(topic)}` : "TOPIC: Keep the topic of the original text",
      "Keep exactly one question. End with a single question mark.",
    ].join("\n"),
    userPrompt: `Remix this question: "${questionText}"`,
  };
}

export function buildEmbeddingTextForStyle(style: StylePromptDoc) {
  return [
    style.name,
    style.description,
    style.aiGuidance ?? style.promptGuidanceForAI,
    style.cognitiveMove,
    style.socialFunction,
    style.structuralInstruction ?? style.structure,
    style.answerShape,
    ...(style.commonFailureModes ?? []),
    ...(style.distinctFrom ?? []),
  ]
    .filter(Boolean)
    .join(". ");
}

export function buildEmbeddingTextForTone(tone: TonePromptDoc) {
  return [
    tone.name,
    tone.description,
    tone.aiGuidance ?? tone.promptGuidanceForAI,
    ...(tone.languageCues ?? []),
    ...(tone.avoidCues ?? []),
  ]
    .filter(Boolean)
    .join(". ");
}

export function buildEmbeddingTextForTopic(topic: TopicPromptDoc) {
  return [
    topic.name,
    topic.description,
    topic.aiGuidance ?? topic.promptGuidanceForAI,
    ...(topic.scopeBoundaries ?? []),
    ...(topic.referencePool ?? []),
    topic.accessibilityNotes,
  ]
    .filter(Boolean)
    .join(". ");
}
