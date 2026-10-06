// What judge.mjs does with run files, verdicts and the owner's labels. Pure, so it can be tested.

/** At most this share of the questions Claude would publish may be ones the owner rejects. */
export const PASS_REJECT_SHARE = 1 / 20;
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
 * a reject. Cards whose text was never judged, or whose check failed, are counted as unjudged
 * and left out of every rate.
 */
export function compareWithLabels(results, cards) {
  const verdicts = new Map(results.filter((result) => result.verdict).map((result) => [result.text, result]));
  const groups = {};
  for (const card of cards) {
    const group = (groups[card.group] ??= { cards: 0, unjudged: 0, wouldPublish: 0, wouldPublishRejected: 0, wouldHold: 0, wouldHoldKept: 0 });
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
      group.wouldHold += 1;
      if (kept) group.wouldHoldKept += 1;
    }
  }
  return groups;
}

/**
 * The pass rule for the blind set, fixed before it was labeled: of the cards the judge would
 * publish, the owner rejects at most 1 in 20, rounded down.
 */
export function passRule(group) {
  if (!group || group.wouldPublish < MIN_PASS_CARDS) {
    return { decided: false, reason: `Needs at least ${MIN_PASS_CARDS} labeled cards the check would publish; there are ${group?.wouldPublish ?? 0}.` };
  }
  const allowed = allowedRejects(group.wouldPublish);
  return { decided: true, pass: group.wouldPublishRejected <= allowed, rejected: group.wouldPublishRejected, allowed, of: group.wouldPublish };
}
