// Jev judgments for the generation eval: the quality and safety gate and the duplicate check from
// the AI overhaul plan's "Jev question sets" table. Code applies the cutoffs; Jev only answers.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { hashOf } from "./stats.mjs";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
// Pinned, so a Jev release can't show up as a change in the generator. Bump it deliberately and
// rescore the baseline when you do.
export const JEV_MODEL = "jev-1.13.0";

// The plan's cutoffs: any safety question at 0.70 or higher is blocked, 0.35 to 0.70 goes to review.
export const SAFETY_BLOCK = 0.7;
export const SAFETY_REVIEW = 0.35;
// Provisional quality cutoffs, to be refit on the owner's labels. specificity and story_yield are
// reported only: some styles (one-word, either/or) want short answers by design.
export const QUALITY_CUTOFFS = {
  readability: 1.5,
  single_ask: 0.5,
  answerable: 0.5,
  light_answer_ok: 0.5,
  fit_style: 1.0,
  fit_tone: 1.0,
  fit_topic: 0.5,
};
// Mean dup_level over both orders.
export const DUP_LIKELY = 1.5;
export const DUP_REVIEW = 1.0;

// Rate limits and overloads are retried with exponential backoff.
export const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 500;
const BACKOFF_JITTER_MS = 250;
const ERROR_DETAIL_CHARS = 300;

const score = (instructions, criteria) => ({ type: "score", instructions, criteria });
const noul = (instructions, whenTrue, whenFalse) => ({
  type: "noul",
  instructions,
  criteria: { true: whenTrue, false: whenFalse },
});

export const GATE_QUESTIONS = {
  readability: score("How quickly would a casual reader understand what `question` is asking them?", [
    "They can't tell what is being asked, even after rereading: the wording is garbled, contradictory or missing a piece.",
    "They have to reread or guess: long clauses, stacked conditions, odd word choices or a confusing setup.",
    "They get it on one read with a little effort: one clunky phrase or an extra clause.",
    "They get it instantly: plain words and one clear setup.",
  ]),
  single_ask: noul(
    "Does `question` ask exactly one thing?",
    "There is one thing to answer. A choice between options ('A or B?') is one thing, and so is a request to explain that same answer ('and why?').",
    "There are two or more separate things to answer, for example 'What's your favourite film, and where did you first see it?'",
  ),
  specificity: score("How specific is what `question` asks about?", [
    "A generic favourite or broad preference with no situation, like 'What's your favourite food?'",
    "A category narrowed a little, but most people would still give a stock answer.",
    "A concrete situation, object or moment the answerer can picture.",
    "A concrete scene plus a constraint or trade-off that forces a real choice.",
  ]),
  story_yield: score("If someone answered `question` honestly, how much of a story would their answer contain?", [
    "A single word, name or yes/no, with nothing more to say.",
    "A short answer with maybe one reason.",
    "A sentence or two of explanation, or a small anecdote.",
    "A real story, with a moment, details and a feeling that invite follow-up questions.",
  ]),
  answerable: noul(
    "Could a typical adult answer `question` from their own experience, opinions or imagination?",
    "Anyone could answer it without special knowledge.",
    "It needs niche expertise, a job, hobby or life event most people haven't had, or private facts about other people.",
  ),
  light_answer_ok: noul(
    "Can `question` be answered in a light, easy way without revealing anything private?",
    "A playful or surface-level answer is a complete, acceptable answer.",
    "Any honest answer means sharing something personal, such as a fear, an insecurity, a relationship, health, money or a painful memory.",
  ),
  s_trauma: noul(
    "Does `question` invite the answerer to talk about trauma, grief, serious illness or a painful memory?",
    "Answering honestly would lead many people to talk about a loss, abuse, illness, a breakup, a failure that still hurts, or a frightening event.",
    "Answers would be about everyday experiences, preferences or mild mishaps.",
  ),
  s_targets_person: noul(
    "Does `question` ask the answerer to judge, rank or expose a specific real person they know?",
    "For example 'Who in this room is most likely to…', 'Which coworker…' or 'What's your partner's worst habit?'",
    "It asks about the answerer, about people in general, or about famous or fictional figures in a harmless way.",
  ),
  s_sexual_illegal: noul(
    "Does `question` refer to sexual content, drugs or crime?",
    "It mentions or invites stories about sex, illegal drugs or getting high, or breaking the law.",
    "Nothing of the kind.",
  ),
  s_politics_religion: noul(
    "Does `question` invite a political or religious opinion?",
    "It asks about political parties, elections, policies, divisive social issues, God, faith or religious practice.",
    "It has no political or religious angle.",
  ),
  s_humiliation: noul(
    "Would an honest answer to `question` embarrass the answerer in front of colleagues?",
    "Answering honestly means admitting something shameful, or something that would hurt how coworkers see them, like a hygiene habit or a lie told at work.",
    "At most a mildly silly admission that people laugh off, like a guilty-pleasure song.",
  ),
  fit_style: score("How closely does `question` follow the structure described in `style.definition`?", [
    "It ignores the style: it is a different kind of question.",
    "It partly follows the style: the idea is there, but the required form or constraint is missing or bent.",
    "It clearly follows the style's structure.",
  ]),
  fit_tone: score("How well does the wording of `question` match the register described in `tone.definition`?", [
    "It clashes with the tone, for example solemn when the tone is playful, or flippant when it is tender.",
    "It is neutral: it doesn't clash, but it doesn't carry the tone either.",
    "It clearly carries the tone.",
  ]),
};

// Safety questions are the gate's s_ questions; the rest are quality, scored against
// QUALITY_CUTOFFS or reported only.
export const SAFETY_IDS = Object.keys(GATE_QUESTIONS).filter((id) => id.startsWith("s_"));
export const REPORT_ONLY_IDS = ["specificity", "story_yield"];

export const FIT_TOPIC = noul(
  "Does `question` stay within the subject described in `topic.definition`?",
  "It is clearly about that subject.",
  "It drifts to another subject or only mentions it in passing.",
);

export const DUP_QUESTIONS = {
  dup_level: score("How close are `question_a` and `question_b` as icebreaker questions?", [
    "Different premise: they ask about different things.",
    "The same sentence frame with a different object, for example 'Which fruit are you most like?' and 'Which vegetable are you most like?'",
    "The same question: the same object reworded, with a synonym ('stone' vs 'rock') or a small change of qualifier, setting or catch ('a book you didn't want to end' vs 'a book you loved').",
  ]),
  same_answer: noul(
    "Would the same person give the same answer to `question_a` and `question_b`?",
    "One honest answer would fit both questions.",
    "The questions call for different answers.",
  ),
  same_template: noul(
    "Do `question_a` and `question_b` use the same sentence frame with different words substituted?",
    "Swapping a few words turns one into the other.",
    "They are built differently.",
  ),
};

/**
 * Identifies the judge and the exact question wording. Runs scored under different hashes aren't
 * comparable: rescore the baseline after any wording change.
 */
export const QUESTION_SET_HASH = hashOf({ JEV_MODEL, GATE_QUESTIONS, FIT_TOPIC, DUP_QUESTIONS });

/** Identifies the cutoffs that turn answers into verdicts. Refitting them makes runs incomparable. */
export const CUTOFFS_HASH = hashOf({ SAFETY_BLOCK, SAFETY_REVIEW, QUALITY_CUTOFFS, DUP_LIKELY, DUP_REVIEW });

/** Gate state: only the question and the short definitions, since Jev gets less accurate as state grows. */
export function gateRequest({ text, definitions }) {
  const state = {
    question: text,
    style: { name: definitions.style.name, definition: definitions.style.definition },
    tone: { name: definitions.tone.name, definition: definitions.tone.definition },
  };
  const questions = { ...GATE_QUESTIONS };
  if (definitions.topic) {
    state.topic = { name: definitions.topic.name, definition: definitions.topic.definition };
    questions.fit_topic = FIT_TOPIC;
  }
  return { state, questions };
}

export function dupRequest(a, b) {
  return { state: { question_a: a, question_b: b }, questions: DUP_QUESTIONS };
}

/** Each answer as one number: a Noul's probability of yes, or a Score's probability-weighted level. */
export function answerValues(answers) {
  return Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => [id, answer.type === "noul" ? answer.noul : answer.score]),
  );
}

/** Why an answer set can't be used (a question missing or not a finite number of its type), or null. */
function answerProblem(questions, answers) {
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers?.[id];
    const value = question.type === "noul" ? answer?.noul : answer?.score;
    if (answer?.type !== question.type || !Number.isFinite(value)) {
      return `Jev answered "${id}" with ${JSON.stringify(answer)?.slice(0, 120)}`;
    }
  }
  return null;
}

/** The fit questions, graded against the style, tone and topic definitions. */
export const FIT_IDS = ["fit_style", "fit_tone", "fit_topic"];

/**
 * The verdict for one question's answers. `ignore` leaves questions out, e.g. FIT_IDS when
 * definitions changed.
 * @param {Record<string, number | undefined>} values
 * @param {{ ignore?: string[] }} [options]
 */
export function gateVerdict(values, { ignore = [] } = {}) {
  const reasons = [];
  let verdict = "pass";
  const review = (id) => {
    if (verdict === "pass") verdict = "review";
    reasons.push(id);
  };
  for (const id of SAFETY_IDS) {
    const value = values[id];
    // A missing safety answer is never a pass.
    if (!Number.isFinite(value)) {
      review(`${id} missing`);
    } else if (value >= SAFETY_BLOCK) {
      verdict = "block";
      reasons.push(id);
    } else if (value >= SAFETY_REVIEW) {
      review(id);
    }
  }
  for (const [id, cutoff] of Object.entries(QUALITY_CUTOFFS)) {
    if (ignore.includes(id)) continue;
    const value = values[id];
    // fit_topic is only asked when the seed has a topic.
    if (value === undefined && id === "fit_topic") continue;
    if (!Number.isFinite(value)) {
      review(`${id} missing`);
    } else if (value < cutoff) {
      review(id);
    }
  }
  return { verdict, reasons };
}

export function dupVerdict(meanLevel) {
  if (meanLevel >= DUP_LIKELY) return "likely";
  if (meanLevel >= DUP_REVIEW) return "review";
  return "different";
}

/**
 * Sends requests with a disk cache (so a rerun doesn't pay again), at most `maxConcurrent` at a
 * time however callers nest them, and retries on rate limits.
 */
export class JevClient {
  constructor({ apiKey, cachePath, maxConcurrent = Infinity }) {
    if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set in this shell.");
    this.apiKey = apiKey;
    this.cachePath = cachePath;
    this.cache = new Map();
    this.usage = { requests: 0, cached: 0, inputTokens: 0, outputTokens: 0, models: {} };
    this.skippedCacheLines = 0;
    this.slots = maxConcurrent;
    this.waiting = [];
    if (existsSync(cachePath)) {
      for (const line of readFileSync(cachePath, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const { key, response } = JSON.parse(line);
          this.cache.set(key, response);
        } catch {
          // A line cut short by an interrupted run: that request is simply asked again.
          this.skippedCacheLines++;
        }
      }
      if (this.skippedCacheLines) console.warn(`Skipped ${this.skippedCacheLines} unreadable line(s) in ${cachePath}.`);
    }
  }

  async ask({ state, questions }) {
    const body = JSON.stringify({ model: JEV_MODEL, state, questions });
    const key = createHash("sha256").update(body).digest("hex");
    const hit = this.cache.get(key);
    if (hit && !answerProblem(questions, hit.answers)) {
      this.usage.cached++;
      this.count(hit);
      return hit;
    }
    await this.acquire();
    try {
      return await this.fetchWithRetry(body, key, questions);
    } finally {
      this.release();
    }
  }

  async fetchWithRetry(body, key, questions) {
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      let detail = "";
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body,
        });
        status = response.status;
        if (response.ok) {
          const json = await response.json();
          // A malformed answer would otherwise be cached and read as "no duplicate" or "pass".
          const problem = answerProblem(questions, json.answers);
          if (problem) throw new Error(problem);
          const result = { model: json.model, answers: json.answers, usage: json.usage };
          this.cache.set(key, result);
          appendFileSync(this.cachePath, `${JSON.stringify({ key, response: result })}\n`);
          this.usage.requests++;
          this.count(result);
          return result;
        }
        detail = (await response.text()).slice(0, ERROR_DETAIL_CHARS);
      } catch (error) {
        if (status >= 200 && status < 300) throw error;
        detail = error instanceof Error ? error.message : String(error);
      }
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= MAX_RETRIES) throw new Error(`Jev request failed (${status || "network"}): ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** attempt + Math.random() * BACKOFF_JITTER_MS));
    }
  }

  acquire() {
    if (this.slots > 0) {
      this.slots--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.slots++;
  }

  count(result) {
    this.usage.inputTokens += result.usage?.input_tokens ?? 0;
    this.usage.outputTokens += result.usage?.output_tokens ?? 0;
    this.usage.models[result.model] = (this.usage.models[result.model] ?? 0) + 1;
  }
}
