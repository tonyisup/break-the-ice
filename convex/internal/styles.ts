import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { styleFields, mapStyle } from "../lib/styleHelpers";
import { Doc } from "../_generated/dataModel";
import { latestActiveVersion } from "../lib/taxonomy";

const STYLE_BACKFILL_BATCH_SIZE = 100;

export const getStylesWithMissingEmbeddings = internalQuery({
  args: {},
  returns: v.array(v.object(styleFields)),
  handler: async (ctx) => {
    const withEmbeddingIds = new Set((await ctx.db.query("style_embeddings").collect()).map((e) => e.styleId));
    const styles = await ctx.db.query("styles").collect();
    return styles.filter((style) => !withEmbeddingIds.has(style._id)).map(mapStyle);
  },
});

export const getStyleBySystemId = internalQuery({
  args: { id: v.id("styles") },
  returns: v.nullable(v.object(styleFields)),
  handler: async (ctx, args) => {
    const style = await ctx.db.get(args.id);
    return style ? mapStyle(style) : null;
  },
});

export const getStyleById = getStyleBySystemId;

export const addStyleEmbedding = internalMutation({
  args: {
    styleId: v.id("styles"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("style_embeddings")
      .withIndex("by_styleId", (q) => q.eq("styleId", args.styleId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { embedding: args.embedding });
    } else {
      await ctx.db.insert("style_embeddings", {
        styleId: args.styleId,
        embedding: args.embedding,
      });
    }
    return null;
  },
});

export const updateQuestionsWithMissingStyleIds = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const questions = await ctx.db
      .query("questions")
      .filter((q) =>
        q.and(
          q.eq(q.field("styleId"), undefined),
          q.neq(q.field("style"), undefined),
        ),
      )
      .take(STYLE_BACKFILL_BATCH_SIZE);

    for (const question of questions) {
      if (!question.styleId && question.style) {
        const style = await ctx.db
          .query("styles")
          .withIndex("by_slug", (q) => q.eq("slug", question.style!))
          .first();

        if (style) {
          await ctx.db.patch(question._id, { styleId: style._id, styleSlug: style.slug ?? style.id });
          await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
            questionId: question._id,
          });
        }
      }
    }

    if (questions.length === STYLE_BACKFILL_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.internal.styles.updateQuestionsWithMissingStyleIds,
        {},
      );
    }
    return null;
  },
});

export const getAllStylesInternal = internalQuery({
  args: {},
  returns: v.array(v.object(styleFields)),
  handler: async (ctx) => {
    return (await ctx.db.query("styles").collect()).map(mapStyle);
  },
});

export const getRandomStyleForUserId = internalQuery({
  args: {
    userId: v.id("users"),
    seed: v.optional(v.number()),
  },
  returns: v.nullable(v.object(styleFields)),
  handler: async (ctx, args) => {
    const styles = await ctx.db.query("styles").take(200);
    const bySlug = new Map<string, Doc<"styles">[]>();
    for (const style of styles) {
      const slug = style.slug ?? style.id;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug)!.push(style);
    }
    const active = Array.from(bySlug.values())
      .map((docs) => latestActiveVersion(docs))
      .filter((s): s is Doc<"styles"> => s !== null)
      .map(mapStyle)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

    const userHiddenStyles = await ctx.db
      .query("userStyles")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "hidden"))
      .collect();
    const hiddenStyleDocs = await Promise.all(userHiddenStyles.map((entry) => ctx.db.get(entry.styleId)));
    const hiddenSlugs = new Set(hiddenStyleDocs.filter((s): s is Doc<"styles"> => s !== null).map((s) => s.slug ?? s.id));
    const visible = active.filter((s) => !hiddenSlugs.has(s.slug));
    if (visible.length === 0) return null;
    const seed = args.seed ?? Math.random();
    const index = Math.floor(seed * visible.length) % visible.length;
    return visible[index];
  },
});
