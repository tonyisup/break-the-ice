// What select.mjs does with a judged run and the owner's labels: picks the best of each batch,
// draws a blind set to label, and reads the labels back. Pure, so it can be tested.
import { seededShuffle } from "./brief.mjs";
import { MIN_PASS_CARDS, allowedRejects } from "./judgeRecord.mjs";

/** A question is picked only on a keep at this confidence or above, with no reasons and no safety flags. */
export const PICK_MIN_CONFIDENCE = 4;

/** Whether the judge's verdict lets a question be picked at all. */
export function clearsBar(verdict) {
  return (
    verdict?.verdict === "keep" &&
    (verdict.reasons ?? []).length === 0 &&
    (verdict.safety ?? []).length === 0 &&
    verdict.confidence >= PICK_MIN_CONFIDENCE
  );
}

/**
 * A blind set from one judged run: from each seed's batch, the `pick` questions the judge is
 * surest of among those that clear the bar (fewer when fewer clear it), and `controls` drawn at
 * random from the rest of the batch. `questions` are `{ text, seedId, style, tone, topic, verdict }`
 * with the names the owner is shown. The cards say nothing of which is which: that is in `key`,
 * with the judge's verdict. Ids run from `start`, as "q" and three digits or more. The same name
 * and questions always give the same set.
 */
export function drawSet({ name, questions, pick, controls, start = 1 }) {
  const bySeed = new Map();
  for (const question of questions) {
    if (!question.verdict) continue;
    const batch = bySeed.get(question.seedId) ?? [];
    batch.push(question);
    bySeed.set(question.seedId, batch);
  }
  const drawn = [];
  const counts = { seeds: bySeed.size, judged: 0, cleared: 0, picked: 0, controls: 0, seedsWithoutPick: 0 };
  for (const [seedId, batch] of bySeed) {
    counts.judged += batch.length;
    // Shuffled first, so questions the judge is equally sure of are taken in no particular order.
    const shuffled = seededShuffle(batch, `${name}:${seedId}:rank`);
    const cleared = shuffled.filter((question) => clearsBar(question.verdict)).sort((x, y) => y.verdict.confidence - x.verdict.confidence);
    counts.cleared += cleared.length;
    const picked = cleared.slice(0, pick);
    if (!picked.length) counts.seedsWithoutPick += 1;
    const rest = seededShuffle(batch.filter((question) => !picked.includes(question)), `${name}:${seedId}:controls`).slice(0, controls);
    for (const question of picked) drawn.push({ question, group: "picked" });
    for (const question of rest) drawn.push({ question, group: "control" });
    counts.picked += picked.length;
    counts.controls += rest.length;
  }
  const cards = [];
  /** @type {Record<string, { group: string, seedId: string, verdict: string, confidence: number }>} */
  const groups = {};
  seededShuffle(drawn, `${name}:order`).forEach(({ question, group }, i) => {
    const order = start + i;
    const id = `q${String(order).padStart(3, "0")}`;
    cards.push({ id, order, text: question.text, style: question.style, tone: question.tone, topic: question.topic ?? null });
    groups[id] = { group, seedId: question.seedId, verdict: question.verdict.verdict, confidence: question.verdict.confidence };
  });
  return { cards, key: { name, pick, controls, counts, groups } };
}

/**
 * Sets the owner's labels beside the key. `labels` maps a card's id to `{ verdict }`, where
 * anything but "keep" counts as a reject, as it did for the first blind set. The pass rule is
 * that set's: of the picked cards, at most 1 in 20 rejected, on at least MIN_PASS_CARDS of
 * them, and only once every picked card has a label. `wholeBatch` weighs the two groups by
 * their share of the batches, for the reject rate with no picking at all.
 * @param {{ key: { counts: { judged: number, picked: number }, groups: Record<string, { group: string }> }, labels: Record<string, { verdict?: string }> }} options
 */
export function scoreSet({ key, labels }) {
  const tally = { picked: { cards: 0, labeled: 0, rejected: 0 }, control: { cards: 0, labeled: 0, rejected: 0 } };
  for (const [id, { group }] of Object.entries(key.groups)) {
    const side = tally[group];
    side.cards += 1;
    const verdict = labels[id]?.verdict;
    if (!verdict) continue;
    side.labeled += 1;
    if (verdict !== "keep") side.rejected += 1;
  }
  const rate = (side) => (side.labeled ? side.rejected / side.labeled : null);
  const { picked, control } = tally;
  let rule;
  if (picked.labeled < picked.cards) rule = { decided: false, reason: `${picked.cards - picked.labeled} picked cards have no label yet.` };
  else if (picked.cards < MIN_PASS_CARDS) rule = { decided: false, reason: `Needs at least ${MIN_PASS_CARDS} picked cards; there are ${picked.cards}.` };
  else rule = { decided: true, pass: picked.rejected <= allowedRejects(picked.cards), rejected: picked.rejected, allowed: allowedRejects(picked.cards), of: picked.cards };
  const pickedShare = key.counts.judged ? key.counts.picked / key.counts.judged : 0;
  const wholeBatch = rate(picked) === null || rate(control) === null ? null : pickedShare * rate(picked) + (1 - pickedShare) * rate(control);
  return { picked: { ...picked, rate: rate(picked) }, control: { ...control, rate: rate(control) }, wholeBatch, rule };
}
