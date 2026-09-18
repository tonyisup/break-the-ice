type FeedQuestion = { text?: string; customText?: string; style?: string; styleId?: string };

const styleKey = (question?: FeedQuestion) => question?.styleId ?? question?.style;

/** Keep short openers while avoiding adjacent repeats when another style is available. */
export function orderQuestionBatch<T extends FeedQuestion>(questions: readonly T[], previous?: FeedQuestion, shortestFirst = true): T[] {
  const remaining = [...questions];
  if (shortestFirst) remaining.sort((a, b) =>
    (a.text ?? a.customText ?? "").length - (b.text ?? b.customText ?? "").length);
  const ordered: T[] = [];
  let lastStyle = styleKey(previous);
  while (remaining.length > 0) {
    const alternate = lastStyle ? remaining.findIndex(question => styleKey(question) !== lastStyle) : 0;
    const [next] = remaining.splice(alternate < 0 ? 0 : alternate, 1);
    ordered.push(next);
    lastStyle = styleKey(next);
  }
  return ordered;
}
