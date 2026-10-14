// What judge.mjs does with run files, verdicts and the owner's labels. Pure, so it can be tested.
import { createHash } from "node:crypto";

/** At most this share of the questions Claude would publish may be ones the owner rejects. */
const PASS_REJECT_SHARE = 1 / 20;
/** Fewer labeled would-publish cards than this can't show anything about a 1-in-20 rate. */
export const MIN_PASS_CARDS = 60;

/**
 * The questions a set of generated runs would have saved, each with the definitions the judge
 * is shown. A text that appears more than once is kept the first time only.
 */
export function savedQuestions(runs) {
  const byText = new Map();
  for (const { run, generated } of runs) {
    for (const batch of generated.batches ?? []) {
      if (!batch.ok || !batch.result) continue;
      const { style, tone, topic } = batch.result.definitions;
      for (const candidate of batch.result.candidates) {
        if (candidate.outcome !== "saved" || byText.has(candidate.text)) continue;
        byText.set(candidate.text, { text: candidate.text, run, seedId: batch.seed.id, style, tone, topic });
      }
    }
  }
  return [...byText.values()];
}

/** How many rejections a labeled set of `count` would-publish cards may hold and still pass. */
export function allowedRejects(count) {
  return Math.floor(count * PASS_REJECT_SHARE);
}

/**
 * Sets the owner's labels beside the judge's verdicts, by question text. An "unsure" counts as
 * a reject, and a card that appears twice counts once. Cards whose text was never judged, or
 * whose check failed, are counted as unjudged and left out of every rate. Each judged card is
 * either one the check would publish or one it would leave for review; `flagged` counts the
 * ones the app would also flag to a team (a hold, or any safety flag), whichever side they are on.
 */
export function compareWithLabels(results, cards) {
  const verdicts = new Map(results.filter((result) => result.verdict).map((result) => [result.text, result]));
  const groups = {};
  const counted = new Set();
  for (const card of cards) {
    if (counted.has(card.text)) continue;
    counted.add(card.text);
    const group = (groups[card.group] ??= {
      cards: 0, unjudged: 0, wouldPublish: 0, wouldPublishRejected: 0, forReview: 0, forReviewKept: 0, flagged: 0, flaggedKept: 0,
    });
    group.cards += 1;
    const judged = verdicts.get(card.text);
    if (!judged) {
      group.unjudged += 1;
      continue;
    }
    const kept = card.verdict === "keep";
    if (judged.wouldPublish) {
      group.wouldPublish += 1;
      if (!kept) group.wouldPublishRejected += 1;
    } else {
      group.forReview += 1;
      if (kept) group.forReviewKept += 1;
    }
    if (judged.wouldFlag) {
      group.flagged += 1;
      if (kept) group.flaggedKept += 1;
    }
  }
  return groups;
}

/**
 * The pass rule for the blind set, fixed before it was labeled: of the cards the judge would
 * publish, the owner rejects at most 1 in 20, rounded down. It takes the `would_publish` group
 * and is decided only on the set as it was drawn: a card that isn't judged in this file, or
 * that this file's verdicts would no longer publish, would otherwise drop out of the count
 * along with any reject on it.
 */
export function passRule(group) {
  const moved = (group?.unjudged ?? 0) + (group?.forReview ?? 0);
  if (moved > 0) {
    return {
      decided: false,
      reason: `${moved} of the ${group.cards} cards drawn as would-publish aren't judged in this file or would no longer publish. Use the judged file the set was drawn from.`,
    };
  }
  if (!group || group.wouldPublish < MIN_PASS_CARDS) {
    return { decided: false, reason: `Needs at least ${MIN_PASS_CARDS} labeled cards the check would publish; there are ${group?.wouldPublish ?? 0}.` };
  }
  const allowed = allowedRejects(group.wouldPublish);
  return { decided: true, pass: group.wouldPublishRejected <= allowed, rejected: group.wouldPublishRejected, allowed, of: group.wouldPublish };
}

/** How many of the owner's decisions the judge is shown with one question (judge.mjs --context). */
const CONTEXT_SAME_STYLE = 10;
const CONTEXT_TOTAL = 24;
const CONTEXT_PER_VERDICT = 12;

/**
 * The owner's decisions the judge is shown beside a question of `styleSlug`: the latest ten of
 * that style, then the latest of other styles up to 24 in all, with at most twelve keeps and
 * twelve rejects among the other styles' and the same style's together. `decisions` are in the
 * order the owner made them, as `{ text, style, tone, verdict, reasons }` with slugs; `names`
 * maps slugs to the names the judge reads. Each list comes back oldest first. When the owner
 * has already decided on `text`, the question being judged, only the decisions made before
 * that one are shown: never the question's own, and nothing decided after the owner saw it.
 * @param {Array<{ text: string, style: string, tone: string, verdict: string, reasons?: string[] }>} decisions
 * @param {string} styleSlug
 * @param {{ styles?: Record<string, { name: string }>, tones?: Record<string, { name: string }> }} names
 * @param {string} [text]
 */
export function judgeContext(decisions, styleSlug, names, text) {
  const example = (decision) => ({
    text: decision.text,
    style: names.styles?.[decision.style]?.name ?? decision.style,
    tone: names.tones?.[decision.tone]?.name ?? decision.tone,
    verdict: decision.verdict,
    reasons: decision.reasons ?? [],
  });
  const own = text === undefined ? -1 : decisions.findIndex((decision) => decision.text === text);
  const decided = (own < 0 ? decisions : decisions.slice(0, own)).filter((decision) => decision.verdict === "keep" || decision.verdict === "reject");
  const sameStyle = decided.filter((decision) => decision.style === styleSlug).slice(-CONTEXT_SAME_STYLE);
  const counts = { keep: 0, reject: 0 };
  for (const decision of sameStyle) counts[decision.verdict] += 1;
  const others = [];
  for (const decision of decided.filter((d) => d.style !== styleSlug).reverse()) {
    if (sameStyle.length + others.length >= CONTEXT_TOTAL) break;
    if (counts[decision.verdict] >= CONTEXT_PER_VERDICT) continue;
    counts[decision.verdict] += 1;
    others.push(decision);
  }
  return { sameStyle: sameStyle.map(example), others: others.reverse().map(example) };
}

/**
 * Names the decisions a judged file was shown, so a file never mixes verdicts made with different
 * ones. The 2 is the rule for which of them a question is shown (judgeContext): files judged
 * before a question's own decision was left out carry no number, and are not resumed.
 */
export function contextLabel(decisions) {
  return `owner-v2-${createHash("sha256").update(JSON.stringify(decisions)).digest("hex").slice(0, 12)}`;
}
