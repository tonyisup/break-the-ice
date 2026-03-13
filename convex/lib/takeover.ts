import { QueryCtx } from "../_generated/server";
import { latestActiveVersion } from "./taxonomy";

export async function getActiveTakeoverTopicsHelper(ctx: QueryCtx) {
  const now = Date.now();
  const topics = await ctx.db
    .query("topics")
    .withIndex("by_takeoverStartDate_takeoverEndDate_order", (t) => t.lt("takeoverStartDate", now))
    .filter((q) =>
      q.and(
        q.neq(q.field("takeoverStartDate"), undefined),
        q.or(q.eq(q.field("takeoverEndDate"), undefined), q.gt(q.field("takeoverEndDate"), now)),
      ),
    )
    .collect();

  const grouped = new Map<string, typeof topics>();
  for (const topic of topics) {
    const slug = topic.slug ?? topic.id;
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(topic);
  }

  return Array.from(grouped.values())
    .map((docs) => latestActiveVersion(docs))
    .filter(Boolean)
    .filter((topic) => (topic!.status ?? "active") === "active");
}
