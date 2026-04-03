import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Best-effort mutex for matrix fill: concurrent claimants insert rows; earliest
 * _creationTime wins, others delete themselves. Not a DB-level unique constraint.
 */
export const claimMatrixFillCell = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		cellKey: v.string(),
	},
	returns: v.object({ claimed: v.boolean() }),
	handler: async (ctx, args) => {
		const myId = await ctx.db.insert("matrixFillCellLocks", {
			organizationId: args.organizationId,
			cellKey: args.cellKey,
		});

		const siblings = await ctx.db
			.query("matrixFillCellLocks")
			.withIndex("by_organizationId_and_cellKey", (q) =>
				q.eq("organizationId", args.organizationId).eq("cellKey", args.cellKey),
			)
			.collect();

		const sorted = siblings.sort(
			(a, b) => a._creationTime - b._creationTime,
		);
		const winner = sorted[0]!;
		if (winner._id !== myId) {
			await ctx.db.delete(myId);
			return { claimed: false };
		}
		for (const doc of sorted.slice(1)) {
			await ctx.db.delete(doc._id);
		}
		return { claimed: true };
	},
});

export const releaseMatrixFillCell = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		cellKey: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const locks = await ctx.db
			.query("matrixFillCellLocks")
			.withIndex("by_organizationId_and_cellKey", (q) =>
				q.eq("organizationId", args.organizationId).eq("cellKey", args.cellKey),
			)
			.collect();
		for (const row of locks) {
			await ctx.db.delete(row._id);
		}
		return null;
	},
});
