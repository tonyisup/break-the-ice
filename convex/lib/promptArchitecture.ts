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
  aiGuidance?: string;
  promptGuidanceForAI?: string;
  distinctFrom?: string[];
  examples?: PromptExample[];
  antiExamples?: PromptExample[];
  commonFailureModes?: string[];
};

export type StylePromptDoc = TaxonomyDoc & {
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

export type PromptBlueprintDoc = {
  _id: string;
  slug: string;
  version: number;
  systemInstruction: string;
  safetyChecklist: string[];
  qualityChecklist: string[];
  outputFormatInstruction: string;
};

export function clampBatchSize(value: number) {
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
}

function bullet(items: string[]) {
  return items
    .filter((item) => item.trim().length > 0)
    .map((item) => `- ${item}`)
    .join("\n");
}

function formatExamples(examples: PromptExample[] | undefined) {
  if (!examples || examples.length === 0) return "- none";

  return examples
    .slice(0, 3)
    .map((example) => (example.note ? `- ${example.text} - ${example.note}` : `- ${example.text}`))
    .join("\n");
}

export function normalizeQuestion(text: string) {
  return text
    .replace(/[""]/g, "\"")
    .replace(/['']/g, "'")
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

export function parseQuestionObjects(raw: string) {
  const cleaned = stripCodeFences(raw);

  try {
    const parsed = JSON.parse(cleaned) as {
      questions?: Array<{ text?: string; rationale?: string } | string>;
    };

    if (!Array.isArray(parsed.questions)) {
      throw new Error('Model output is missing a "questions" array.');
    }

    return parsed.questions
      .map((item) => {
        if (typeof item === "string") return { text: item };
        return {
          text: typeof item?.text === "string" ? item.text : "",
          rationale: typeof item?.rationale === "string" ? item.rationale : undefined,
        };
      })
      .filter((item) => item.text.trim().length > 0);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model did not return parseable JSON.");
    }
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      questions?: Array<{ text?: string; rationale?: string } | string>;
    };
    if (!Array.isArray(parsed.questions)) {
      throw new Error('Model output is missing a "questions" array.');
    }
    return parsed.questions
      .map((item) => {
        if (typeof item === "string") return { text: item };
        return {
          text: typeof item?.text === "string" ? item.text : "",
          rationale: typeof item?.rationale === "string" ? item.rationale : undefined,
        };
      })
      .filter((item) => item.text.trim().length > 0);
  }
}

export function parseQuestionTexts(raw: string) {
  return parseQuestionObjects(raw).map((item) => item.text);
}

export function buildGenerationPrompts(args: {
  style: StylePromptDoc;
  tone: TonePromptDoc;
  topic?: TopicPromptDoc | null;
  blueprint: PromptBlueprintDoc;
  batchSize: number;
  excludedQuestions?: string[];
  currentQuestion?: string;
  userContext?: string;
}) {
  const { style, tone, topic, blueprint, batchSize, excludedQuestions = [], currentQuestion, userContext } = args;

  const systemPrompt = [
    "You generate ice-breaker questions for a scrolling feed.",
    "Optimize for prompt quality, feed diversity, embedding separability,",
    "replayability, and low-friction engagement.",
    "",
    "Global non-negotiables:",
    "- One card contains one prompt and one question mark.",
    "- The prompt must be understood in a few seconds.",
    "- Prefer specific scenes, constraints, trade-offs, memories, habits,",
    "  values, taste, or quirks over generic favorites.",
    "- Low-stakes vulnerability beats high-stakes intensity.",
    "- Avoid bland prompts, trauma mining, explicit sexual content,",
    "  self-harm, criminal confession framing, humiliation mechanics,",
    "  panic scenarios, and default politics or religion.",
    "- Keep prompts answerable without niche expertise or perfect memory.",
    "- Do not copy examples verbatim.",
    "",
    blueprint.systemInstruction,
    "",
    "Quality checklist:",
    bullet(blueprint.qualityChecklist),
    "",
    "Safety checklist:",
    bullet(blueprint.safetyChecklist),
    "",
    "Output rules:",
    `- Return exactly ${batchSize} questions.`,
    "- Return JSON only.",
    '- Use this shape: {"questions":[{"text":"...?", "rationale":"..."}]}',
    '- "rationale" should be short and optional, but "text" is required.',
    blueprint.outputFormatInstruction,
  ].join("\n");

  const effectiveStyleGuidance = style.aiGuidance ?? style.promptGuidanceForAI ?? "";
  const effectiveToneGuidance = tone.aiGuidance ?? tone.promptGuidanceForAI ?? "";
  const effectiveTopicGuidance = topic ? (topic.aiGuidance ?? topic.promptGuidanceForAI ?? "") : "";
  const excluded = [...excludedQuestions];
  if (currentQuestion) excluded.push(currentQuestion);

  const userPrompt = [
    `Generate ${batchSize} ice-breaker questions for this taxonomy combo.`,
    "",
    "STYLE",
    `Name: ${style.name}`,
    `Description: ${style.description ?? ""}`,
    `Cognitive move: ${style.cognitiveMove ?? "not specified"}`,
    `Social function: ${style.socialFunction ?? "not specified"}`,
    `Structural instruction: ${style.structuralInstruction ?? style.structure ?? ""}`,
    `Answer shape: ${style.answerShape ?? "short conversational answer"}`,
    `AI guidance: ${effectiveStyleGuidance}`,
    `Distinct from: ${(style.distinctFrom ?? []).join(", ") || "none listed"}`,
    "Good examples:",
    formatExamples(style.examples),
    "Avoid examples like:",
    formatExamples(style.antiExamples),
    "",
    "TONE",
    `Name: ${tone.name}`,
    `Description: ${tone.description ?? ""}`,
    `AI guidance: ${effectiveToneGuidance}`,
    `Language cues: ${(tone.languageCues ?? []).join(", ") || "none listed"}`,
    `Avoid cues: ${(tone.avoidCues ?? []).join(", ") || "none listed"}`,
    "",
    "TOPIC",
    `Name: ${topic?.name ?? "General"}`,
    `Description: ${topic?.description ?? ""}`,
    `AI guidance: ${effectiveTopicGuidance}`,
    `Scope boundaries: ${(topic?.scopeBoundaries ?? []).join(", ") || "none listed"}`,
    `Reference pool: ${(topic?.referencePool ?? []).slice(0, 12).join(", ") || "none listed"}`,
    "",
    "Important generation notes:",
    "- Preserve the style as structure, not topic or tone.",
    "- Let tone affect wording and emotional temperature, not format.",
    "- Let topic shape the semantic domain, not the structure.",
    "- Make each question distinct enough to avoid repetitive feed feel.",
    "- Avoid obvious or default answers.",
    "- Favor prompts that reveal taste, habits, memories, priorities, humor profile, or small confessions.",
    excluded.length > 0
      ? `- Avoid topics, patterns, or phrasing similar to these seen questions:\n${bullet(excluded)}`
      : "",
    userContext ? `User context:\n- ${userContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

export function buildRemixPrompts(args: {
  questionText: string;
  style?: StylePromptDoc | null;
  tone?: TonePromptDoc | null;
  topic?: TopicPromptDoc | null;
}) {
  const { questionText, style, tone, topic } = args;

  const effectiveStyleStructure = style?.structuralInstruction ?? style?.structure ?? "Direct and engaging";
  const effectiveToneGuidance = tone?.aiGuidance ?? tone?.promptGuidanceForAI ?? "Keep the tone of the original text";
  const effectiveTopicGuidance = topic?.aiGuidance ?? topic?.promptGuidanceForAI ?? "Keep the topic of the original text";

  return {
    systemPrompt: [
      "You are a world-class creative writer specializing in social psychology and ice-breakers.",
      'TASK: Remix the user\'s question. Change the words and phrasing completely.',
      "FORMAT: Return only the new question text as a plain string.",
      `STYLE STRUCTURE: ${effectiveStyleStructure}`,
      `TONE GUIDE: ${effectiveToneGuidance}`,
      `TOPIC FOCUS: ${effectiveTopicGuidance}`,
      "Keep exactly one question. End with a single question mark.",
    ].join("\n"),
    userPrompt: [
      `Remix this question: "${questionText}"`,
      "",
      "Context:",
      `Style: ${style?.name ?? "General"} (${style?.description ?? ""})`,
      `Tone: ${tone?.name ?? "General"} (${tone?.description ?? ""})`,
      topic ? `Topic: ${topic.name} (${topic.description ?? ""})` : "",
    ]
      .filter(Boolean)
      .join("\n"),
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
