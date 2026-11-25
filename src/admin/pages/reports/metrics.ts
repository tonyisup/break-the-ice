import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type ReportRow = FunctionReturnType<typeof api.admin.reports.getPerformanceReport>["rows"][number];

/**
 * The range a rate's true value likely sits in, given `hits` out of `trials` (Wilson score
 * interval, 95%). With few trials the range is wide, so one like from one view doesn't outrank
 * thirty from a hundred.
 */
export function wilson(hits: number, trials: number, z = 1.96): { low: number; high: number } {
  if (trials <= 0) return { low: 0, high: 1 };
  const p = Math.min(hits, trials) / trials;
  const z2 = z * z;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  const denominator = 1 + z2 / trials;
  return { low: Math.max(0, (centre - spread) / denominator), high: Math.min(1, (centre + spread) / denominator) };
}

/**
 * Views of a question. A like or hide on the question's own page records no "seen" event, so a
 * question can have more likes than seen events: it was viewed at least that many times.
 */
export const viewsOf = (row: Pick<ReportRow, "seen" | "liked" | "hidden">) => Math.max(row.seen, row.liked, row.hidden);
const rate = (hits: number, trials: number) => (trials > 0 ? Math.min(hits, trials) / trials : 0);

export type RatedRow = ReportRow & {
  views: number;
  likeRate: number;
  hideRate: number;
  /** The like rate the data can vouch for at least: top performers sort by it. */
  likeLow: number;
  /** The like rate the data allows at most: questions that need attention sort by it. */
  likeHigh: number;
};

export function rated(row: ReportRow): RatedRow {
  const views = viewsOf(row);
  const { low, high } = wilson(row.liked, views);
  return { ...row, views, likeRate: rate(row.liked, views), hideRate: rate(row.hidden, views), likeLow: low, likeHigh: high };
}

export type QuestionView = "top" | "poor" | "all";
export type SortKey = "score" | "text" | "views" | "likeRate" | "shared" | "hideRate" | "avgViewMs";
export type Sort = { key: SortKey; direction: "asc" | "desc" };

/** The sort each view starts with. "score" means the view's own ranking. */
export const VIEW_SORT: Record<QuestionView, Sort> = {
  top: { key: "score", direction: "desc" },
  poor: { key: "score", direction: "asc" },
  all: { key: "views", direction: "desc" },
};

export type QuestionFilter = {
  view: QuestionView;
  minViews: number;
  search: string;
  style?: string;
  tone?: string;
  topic?: string;
  model?: string;
};

/**
 * Library questions for the questions tab. Top and Needs attention leave out questions with
 * fewer than minViews views, since their rates say little yet; All lists every one.
 */
export function questionList(rows: RatedRow[], filter: QuestionFilter, sort: Sort): RatedRow[] {
  const search = filter.search.trim().toLowerCase();
  const list = rows.filter(
    (row) =>
      row.status === "live" &&
      (filter.view === "all" || row.views >= filter.minViews) &&
      (!search || row.text.toLowerCase().includes(search)) &&
      (filter.style === undefined || (row.style ?? "") === filter.style) &&
      (filter.tone === undefined || (row.tone ?? "") === filter.tone) &&
      (filter.topic === undefined || (row.topic ?? "") === filter.topic) &&
      (filter.model === undefined || (row.model ?? "") === filter.model),
  );
  const sign = sort.direction === "asc" ? 1 : -1;
  const value = (row: RatedRow): number | string => {
    if (sort.key !== "score") return row[sort.key];
    // Top ranks by what the likes prove; Needs attention by how low the likes could be, and
    // among equals by hides. "All" sorts by the proven rate too.
    return filter.view === "poor" ? row.likeHigh - row.hideRate / 1000 : row.likeLow;
  };
  return [...list].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const order = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return order * sign || b.views - a.views;
  });
}

export type Dimension = "style" | "tone" | "topic" | "model";

export type GroupSummary = {
  /** The style, tone or topic slug, or the model id; "" for questions without one. */
  key: string;
  questions: number;
  live: number;
  pending: number;
  rejected: number;
  retired: number;
  views: number;
  liked: number;
  shared: number;
  hidden: number;
  likeRate: number;
  hideRate: number;
  avgViewMs: number;
  /** The owner's decisions on this group's AI questions: approved out of decided. */
  approved: number;
  decided: number;
  /** Claude's verdicts on this group's questions: keep out of checked. */
  claudeKeep: number;
  claudeChecked: number;
  /** AI questions you decided that Claude had checked, and how many you decided its way. */
  agreed: number;
  compared: number;
};

/**
 * One row per style, tone, topic or model: engagement across all its questions (retired ones too, as
 * their views happened), your review decisions on its AI questions, and Claude's verdicts.
 */
export function summarize(rows: RatedRow[], dimension: Dimension): GroupSummary[] {
  const groups = new Map<string, GroupSummary & { timedMs: number; seen: number }>();
  for (const row of rows) {
    const key = row[dimension] ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        key, questions: 0, live: 0, pending: 0, rejected: 0, retired: 0, views: 0, liked: 0, shared: 0, hidden: 0,
        likeRate: 0, hideRate: 0, avgViewMs: 0, approved: 0, decided: 0, claudeKeep: 0, claudeChecked: 0, agreed: 0, compared: 0, timedMs: 0, seen: 0,
      };
      groups.set(key, group);
    }
    group.questions++;
    group[row.status]++;
    group.views += row.views;
    group.liked += row.liked;
    group.shared += row.shared;
    group.hidden += row.hidden;
    // Each question's average weighs in by its views.
    group.timedMs += row.avgViewMs * row.seen;
    group.seen += row.seen;
    if (row.claude) {
      group.claudeChecked++;
      if (row.claude === "keep") group.claudeKeep++;
    }
    const decided = row.isAIGenerated && (row.status === "live" || row.status === "rejected");
    if (decided) {
      group.decided++;
      if (row.status === "live") group.approved++;
      if (row.claude) {
        group.compared++;
        if ((row.claude === "keep") === (row.status === "live")) group.agreed++;
      }
    }
  }
  return [...groups.values()].map(({ timedMs, seen, ...group }) => ({
    ...group,
    likeRate: rate(group.liked, group.views),
    hideRate: rate(group.hidden, group.views),
    avgViewMs: seen > 0 ? Math.round(timedMs / seen) : 0,
  }));
}

/** A CSV document. A cell that starts like a formula is quoted as text, so a spreadsheet won't run it. */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

export function questionsCsv(rows: RatedRow[], name: (dimension: Dimension, slug?: string) => string): string {
  return toCsv(
    ["Question", "Style", "Tone", "Topic", "Model", "Views", "Likes", "Like rate", "Shares", "Hides", "Hide rate", "Avg seconds", "Written by", "ID"],
    rows.map((row) => [
      row.text,
      name("style", row.style),
      name("tone", row.tone),
      name("topic", row.topic),
      name("model", row.model),
      row.views,
      row.liked,
      row.likeRate.toFixed(3),
      row.shared,
      row.hidden,
      row.hideRate.toFixed(3),
      (row.avgViewMs / 1000).toFixed(1),
      row.byPerson ? "Person" : row.isAIGenerated ? "AI" : "Library",
      row.id,
    ]),
  );
}

export function summaryCsv(groups: GroupSummary[], label: string, name: (slug: string) => string): string {
  return toCsv(
    [label, "Questions", "Live", "Pending", "Rejected", "Retired", "Views", "Likes", "Like rate", "Shares", "Hides", "Hide rate", "Avg seconds", "Approved", "Decided", "Claude keep", "Claude checked", "Agreed with Claude", "Compared"],
    groups.map((g) => [
      name(g.key), g.questions, g.live, g.pending, g.rejected, g.retired, g.views, g.liked, g.likeRate.toFixed(3), g.shared, g.hidden,
      g.hideRate.toFixed(3), (g.avgViewMs / 1000).toFixed(1), g.approved, g.decided, g.claudeKeep, g.claudeChecked, g.agreed, g.compared,
    ]),
  );
}

/** Questions for an email: each one, then its public link, a blank line between. */
export function emailCopy(rows: Pick<ReportRow, "id" | "text">[], origin: string): string {
  return rows.map((row) => `${row.text}\n${origin}/question/${row.id}`).join("\n\n");
}

export const percent = (value: number) => `${Math.round(value * 100)}%`;
export const seconds = (ms: number) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : "–");
