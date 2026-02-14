import { QueryCtx } from "../_generated/server";

export async function getActiveTakeoverTopicsHelper(ctx: QueryCtx) {
    const now = Date.now();
    return await ctx.db
        .query("topics")
        .withIndex("by_takeoverStartDate_takeoverEndDate_order", (t) =>
            t.lt("takeoverStartDate", now)
        )
        .filter((q) => q.and(
            q.neq(q.field("takeoverStartDate"), undefined),
            q.or(
                q.eq(q.field("takeoverEndDate"), undefined),
                q.gt(q.field("takeoverEndDate"), now)
            )
        ))
        .collect();
}
