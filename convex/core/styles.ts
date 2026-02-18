import { v } from "convex/values";
import { query } from "../_generated/server";

const publicStyleFields = {
	_id: v.id("styles"),
	_creationTime: v.number(),
	id: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	structure: v.string(),
	color: v.string(),
	icon: v.string(),
	example: v.optional(v.string()),
	promptGuidanceForAI: v.optional(v.string()),
	order: v.optional(v.float64()),
};

export const getStyle = query({
	args: { id: v.string() },
	returns: v.union(v.object(publicStyleFields), v.null()),
	handler: async (ctx, args) => {
		const style = await ctx.db.query("styles")
			.withIndex("by_my_id", (q) => q.eq("id", args.id))
			.unique();
		if (!style) {
			return null;
		}
		const { organizationId: _o, ...rest } = style;
		return rest;
	},
});

export const getStyleById = query({
	args: { id: v.id("styles") },
	returns: v.union(v.object(publicStyleFields), v.null()),
	handler: async (ctx, args) => {
		const style = await ctx.db.get(args.id);
		if (!style) {
			return null;
		}
		const { organizationId: _o, ...rest } = style;
		return rest;
	},
});

export const getStylesWithExamples = query({
	args: { id: v.string(), seed: v.optional(v.number()) },
	returns: v.union(
		v.object({
			_id: v.id("styles"),
			_creationTime: v.number(),
			id: v.string(),
			name: v.string(),
			description: v.optional(v.string()),
			structure: v.string(),
			color: v.string(),
			icon: v.string(),
			example: v.optional(v.string()),
			examples: v.optional(v.array(v.string())),
			promptGuidanceForAI: v.optional(v.string()),
			order: v.optional(v.float64()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const style = await ctx.db.query("styles")
			.withIndex("by_my_id", (q) => q.eq("id", args.id))
			.unique();
		if (!style) {
			return null;
		}

		const { organizationId: _o, ...rest } = style;

		const exampleQuestions = await ctx.db.query("questions")
			.withIndex("by_style", (q) => q.eq("styleId", style._id))
			.collect();

		const examples = exampleQuestions.map((q) => q.text).filter((q) => q !== undefined);

		if (examples.length === 0) {
			return { ...rest, examples: undefined };
		}

		const seed = args.seed ?? Math.random() * 0xFFFFFFFF;
		const mulberry32 = (a: number) => {
			return () => {
				let t = a += 0x6D2B79F5;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			}
		};
		const rng = mulberry32(seed);

		const maxExamples = process.env.MAX_EXAMPLES_PER_STYLE ? parseInt(process.env.MAX_EXAMPLES_PER_STYLE) : 3;
		const sortedExamples = [...examples].sort(() => 0.5 - rng());
		const sampledExamples = sortedExamples.slice(0, maxExamples);

		return {
			...rest,
			examples: sampledExamples,
		};
	},
});

// Get all available styles
export const getStyles = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.object(publicStyleFields)),
	handler: async (ctx, args) => {
		const styles = await ctx.db
			.query("styles")
			.withIndex("by_order")
			.order("asc")
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.collect();
		return styles.map(({ organizationId: _o, ...rest }) => rest);
	},
});

// Get all available styles
export const getFilteredStyles = query({
	args: {
		excluded: v.array(v.string()),
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.object(publicStyleFields)),
	handler: async (ctx, args) => {
		const styles = await ctx.db.query("styles")
			.withIndex("by_order")
			.order("asc")
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.filter((q) => q.and(...args.excluded.map(styleId => q.neq(q.field("id"), styleId))))
			.collect();
		return styles.map(({ organizationId: _o, ...rest }) => rest);
	},
});

export const getRandomStyle = query({
	args: { seed: v.optional(v.number()) },
	returns: v.object(publicStyleFields),
	handler: async (ctx, args) => {
		const styles = await ctx.db.query("styles").withIndex("by_order").order("asc").collect();
		if (styles.length === 0) {
			throw new Error("No styles found in the database");
		}

		const seed = args.seed ?? Math.random() * 0xFFFFFFFF;
		const mulberry32 = (a: number) => {
			return () => {
				let t = a += 0x6D2B79F5;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			}
		};
		const rng = mulberry32(seed);

		const index = Math.floor(rng() * styles.length);
		const randomStyle = styles[index];
		const { organizationId: _o, ...rest } = randomStyle;
		return rest;
	},
});

export const getRandomStyleForUser = query({
	args: { userId: v.id("users") },
	returns: v.object(publicStyleFields),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) {
			throw new Error("User not found");
		}

		const allStyles = await ctx.db.query("styles").withIndex("by_order").order("asc").collect();

		const userHiddenStyles = await ctx.db.query("userStyles")
			.withIndex("by_userId_status", (q) => q
				.eq("userId", args.userId)
				.eq("status", "hidden"))
			.collect();

		const hiddenIds = new Set(userHiddenStyles.map(s => s.styleId));
		const styles = allStyles.filter(s => !hiddenIds.has(s._id));

		if (styles.length === 0) {
			throw new Error("No styles available for user");
		}

		const seed = Math.random() * 0xFFFFFFFF;
		const mulberry32 = (a: number) => {
			return () => {
				let t = a += 0x6D2B79F5;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			}
		};
		const rng = mulberry32(seed);

		const index = Math.floor(rng() * styles.length);
		const randomStyle = styles[index];
		const { organizationId: _o, ...rest } = randomStyle;
		return rest;
	},
});
