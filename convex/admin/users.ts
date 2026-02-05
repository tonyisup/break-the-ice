import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const makeAdmin = mutation({
	args: {
		email: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.patch(user._id, { isAdmin: true });
		return null;
	},
});

export const getUsers = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		return await ctx.db
			.query("users")
			.order("desc")
			.collect();
	},
});
