/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import OpenAI from "openai";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { openRouterClient } from "./lib/generationRunner";
import schema from "./schema";

const adminIdentity = { metadata: { isAdmin: "true" } };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("taxonomy version activation", () => {
  test("moves existing questions and embedding filters from any old version to the activated version", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const now = Date.now();

    const ids = await t.run(async (ctx) => {
      const styleV1 = await ctx.db.insert("styles", {
        id: "reflective",
        name: "Reflective v1",
        structure: "Ask for a reflection",
        color: "#111111",
        icon: "sparkles",
      });
      const styleV2 = await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Reflective v2",
        structure: "Ask for a newer reflection",
        color: "#222222",
        icon: "sparkles",
        version: 2,
        status: "active",
      });
      const styleV3 = await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Reflective v3",
        structure: "Ask for the newest reflection",
        color: "#333333",
        icon: "sparkles",
        version: 3,
        status: "draft",
      });

      const toneV1 = await ctx.db.insert("tones", {
        id: "warm",
        name: "Warm v1",
        promptGuidanceForAI: "Be warm",
        color: "#111111",
        icon: "sun",
      });
      const toneV2 = await ctx.db.insert("tones", {
        id: "warm",
        slug: "warm",
        name: "Warm v2",
        promptGuidanceForAI: "Be warmer",
        color: "#222222",
        icon: "sun",
        version: 2,
        status: "active",
      });
      const toneV3 = await ctx.db.insert("tones", {
        id: "warm",
        slug: "warm",
        name: "Warm v3",
        promptGuidanceForAI: "Be warmest",
        color: "#333333",
        icon: "sun",
        version: 3,
        status: "draft",
      });

      const topicV1 = await ctx.db.insert("topics", {
        id: "weekends",
        name: "Weekends v1",
      });
      const topicV2 = await ctx.db.insert("topics", {
        id: "weekends",
        slug: "weekends",
        name: "Weekends v2",
        version: 2,
        status: "active",
      });
      const topicV3 = await ctx.db.insert("topics", {
        id: "weekends",
        slug: "weekends",
        name: "Weekends v3",
        version: 3,
        status: "draft",
      });

      const questionId = await ctx.db.insert("questions", {
        text: "What makes a weekend memorable?",
        averageViewDuration: 0,
        totalLikes: 0,
        totalShows: 0,
        status: "public",
        style: "reflective",
        styleId: styleV1,
        styleSlug: "reflective",
        styleVersion: 1,
        tone: "warm",
        toneId: toneV1,
        toneSlug: "warm",
        toneVersion: 1,
        topic: "weekends",
        topicId: topicV1,
        topicSlug: "weekends",
        topicVersion: 1,
      });
      const embeddingId = await ctx.db.insert("question_embeddings", {
        questionId,
        embedding: Array.from({ length: 384 }, () => 0),
        status: "public",
        styleId: styleV1,
        toneId: toneV1,
        topicId: topicV1,
      });

      return {
        questionId,
        embeddingId,
        styleV1,
        styleV2,
        styleV3,
        toneV1,
        toneV2,
        toneV3,
        topicV1,
        topicV2,
        topicV3,
      };
    });

    const admin = t.withIdentity(adminIdentity);
    await admin.mutation(api.admin.styles.activateStyleVersion, {
      id: ids.styleV3,
    });
    await admin.mutation(api.admin.tones.activateToneVersion, {
      id: ids.toneV3,
    });
    await admin.mutation(api.admin.topics.activateTopicVersion, {
      _id: ids.topicV3,
    });

    const beforeScheduledWork = await t.run(async (ctx) => ({
      question: await ctx.db.get(ids.questionId),
      embedding: await ctx.db.get(ids.embeddingId),
    }));
    expect(beforeScheduledWork.question).toMatchObject({
      styleId: ids.styleV1,
      toneId: ids.toneV1,
      topicId: ids.topicV1,
    });
    expect(beforeScheduledWork.embedding).toMatchObject({
      styleId: ids.styleV1,
      toneId: ids.toneV1,
      topicId: ids.topicV1,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const result = await t.run(async (ctx) => ({
      question: await ctx.db.get(ids.questionId),
      embedding: await ctx.db.get(ids.embeddingId),
      oldVersions: await Promise.all([
        ctx.db.get(ids.styleV1),
        ctx.db.get(ids.styleV2),
        ctx.db.get(ids.toneV1),
        ctx.db.get(ids.toneV2),
        ctx.db.get(ids.topicV1),
        ctx.db.get(ids.topicV2),
      ]),
    }));

    expect(result.question).toMatchObject({
      style: "reflective",
      styleId: ids.styleV3,
      styleSlug: "reflective",
      styleVersion: 3,
      tone: "warm",
      toneId: ids.toneV3,
      toneSlug: "warm",
      toneVersion: 3,
      topic: "weekends",
      topicId: ids.topicV3,
      topicSlug: "weekends",
      topicVersion: 3,
    });
    expect(result.embedding).toMatchObject({
      styleId: ids.styleV3,
      toneId: ids.toneV3,
      topicId: ids.topicV3,
    });
    expect(
      result.oldVersions.every((version) => version?.status === "archived"),
    ).toBe(true);
  });

  test("defers and continues question and preference reassignment in scheduled batches", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    const { oldStyleId, newStyleId, userStyleId } = await t.run(async (ctx) => {
      const oldStyleId = await ctx.db.insert("styles", {
        id: "story",
        slug: "story",
        name: "Story v1",
        structure: "Ask for a story",
        color: "#111111",
        icon: "book",
        version: 1,
        status: "active",
      });
      const newStyleId = await ctx.db.insert("styles", {
        id: "story",
        slug: "story",
        name: "Story v2",
        structure: "Ask for a vivid story",
        color: "#222222",
        icon: "book",
        version: 2,
        status: "draft",
      });

      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("questions", {
          text: `Story question ${index}?`,
          averageViewDuration: 0,
          totalLikes: 0,
          totalShows: 0,
          status: "public",
          style: "story",
          styleId: oldStyleId,
          styleSlug: "story",
          styleVersion: 1,
        });
      }

      const userId = await ctx.db.insert("users", {
        email: "scheduled-style@example.com",
      });
      const userStyleId = await ctx.db.insert("userStyles", {
        userId,
        styleId: oldStyleId,
        status: "preferred",
        updatedAt: Date.now(),
      });

      return { oldStyleId, newStyleId, userStyleId };
    });

    await t
      .withIdentity(adminIdentity)
      .mutation(api.admin.styles.activateStyleVersion, { id: newStyleId });

    const beforeScheduledWork = await t.run(async (ctx) => ({
      oldQuestions: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", oldStyleId))
        .collect(),
      newQuestions: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", newStyleId))
        .collect(),
      userStyle: await ctx.db.get(userStyleId),
    }));
    expect(beforeScheduledWork.oldQuestions).toHaveLength(101);
    expect(beforeScheduledWork.newQuestions).toHaveLength(0);
    expect(beforeScheduledWork.userStyle?.styleId).toBe(oldStyleId);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const counts = await t.run(async (ctx) => ({
      old: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", oldStyleId))
        .collect(),
      current: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", newStyleId))
        .collect(),
      userStyle: await ctx.db.get(userStyleId),
    }));

    expect(counts.old).toHaveLength(0);
    expect(counts.current).toHaveLength(101);
    expect(
      counts.current.every((question) => question.styleVersion === 2),
    ).toBe(true);
    expect(counts.userStyle?.styleId).toBe(newStyleId);
  });
});

describe("the prompt line on admin edits", () => {
  // Saving a topic queues its embedding. Nothing here runs queued work, and if something did,
  // these stop a call from leaving the machine.
  function app() {
    vi.useFakeTimers();
    vi.spyOn(openRouterClient.chat.completions, "create").mockRejectedValue(new Error("unexpected model call"));
    vi.spyOn(OpenAI.Embeddings.prototype, "create").mockRejectedValue(new Error("unexpected embedding call"));
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    return { t, admin: t.withIdentity(adminIdentity) };
  }
  type App = ReturnType<typeof app>;
  type AnyId = Id<"styles"> | Id<"tones"> | Id<"topics">;
  type Row = { _id: AnyId; status?: string; version?: number; brief?: string; form?: string };
  type Seed = { status: "draft" | "active"; version: number; brief?: string };

  const styleForm = { name: "Either/Or", structure: "Offer two options", color: "#111111", icon: "sparkles" };
  const toneForm = { name: "Warm", promptGuidanceForAI: "Be warm", color: "#111111", icon: "sun" };
  const newestFirst = (rows: Row[]) => rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));

  // The same three things for each list: seed a row, send the admin form, read the rows back.
  const kinds: Array<{
    kind: string;
    slug: string;
    seed: (t: App["t"], fields: Seed) => Promise<AnyId>;
    create: (admin: App["admin"], slug: string, line: { brief?: string }) => Promise<unknown>;
    edit: (admin: App["admin"], id: AnyId, line: { brief?: string }) => Promise<unknown>;
    rows: (t: App["t"], slug: string) => Promise<Row[]>;
  }> = [
    {
      kind: "style",
      slug: "either-or",
      seed: (t, fields) => t.run((ctx) => ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, ...fields })),
      create: (admin, slug, line) => admin.mutation(api.admin.styles.createStyle, { id: slug, ...styleForm, ...line }),
      edit: (admin, id, line) =>
        admin.mutation(api.admin.styles.updateStyle, { _id: id as Id<"styles">, id: "either-or", ...styleForm, ...line }),
      rows: (t, slug) =>
        t.run(async (ctx) => newestFirst(await ctx.db.query("styles").withIndex("by_slug", (q) => q.eq("slug", slug)).collect())),
    },
    {
      kind: "tone",
      slug: "warm",
      seed: (t, fields) => t.run((ctx) => ctx.db.insert("tones", { id: "warm", slug: "warm", ...toneForm, ...fields })),
      create: (admin, slug, line) => admin.mutation(api.admin.tones.createTone, { id: slug, ...toneForm, ...line }),
      edit: (admin, id, line) => admin.mutation(api.admin.tones.updateTone, { _id: id as Id<"tones">, ...toneForm, ...line }),
      rows: (t, slug) =>
        t.run(async (ctx) => newestFirst(await ctx.db.query("tones").withIndex("by_slug", (q) => q.eq("slug", slug)).collect())),
    },
    {
      kind: "topic",
      slug: "weekends",
      seed: (t, fields) => t.run((ctx) => ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", ...fields })),
      create: (admin, slug, line) => admin.mutation(api.admin.topics.createTopic, { id: slug, name: "Weekends", ...line }),
      edit: (admin, id, line) => admin.mutation(api.admin.topics.updateTopic, { _id: id as Id<"topics">, name: "Weekends", ...line }),
      rows: (t, slug) =>
        t.run(async (ctx) => newestFirst(await ctx.db.query("topics").withIndex("by_slug", (q) => q.eq("slug", slug)).collect())),
    },
  ];

  for (const { kind, slug, seed, create, edit, rows } of kinds) {
    test(`creating a ${kind} saves its prompt line trimmed, and a blank line or none saves no line`, async () => {
      const { t, admin } = app();

      await create(admin, "with-a-line", { brief: "  Two everyday things, and the person picks one.  " });
      await create(admin, "blank-line", { brief: "   " });
      await create(admin, "no-line", {});

      expect(await rows(t, "with-a-line")).toMatchObject([
        { status: "draft", version: 1, brief: "Two everyday things, and the person picks one." },
      ]);
      expect((await rows(t, "blank-line"))[0]).not.toHaveProperty("brief");
      expect((await rows(t, "no-line"))[0]).not.toHaveProperty("brief");
    });

    test(`editing a live ${kind} keeps its prompt line on the new version, and a line that is sent replaces it or clears it`, async () => {
      const { t, admin } = app();
      const live = await seed(t, { status: "active", version: 1, brief: "The old line." });
      const newest = async () => (await rows(t, slug))[0];

      // An admin page loaded before the field existed sends no line at all.
      await edit(admin, live, {});
      expect(await newest()).toMatchObject({ status: "draft", version: 2, brief: "The old line." });

      await edit(admin, live, { brief: "  A new line.  " });
      expect(await newest()).toMatchObject({ status: "draft", version: 3, brief: "A new line." });

      await edit(admin, live, { brief: " " });
      const cleared = await newest();
      expect(cleared).toMatchObject({ status: "draft", version: 4 });
      expect(cleared).not.toHaveProperty("brief");

      // The live row is the one the generator reads until a draft is activated.
      expect((await rows(t, slug)).at(-1)).toMatchObject({ _id: live, status: "active", brief: "The old line." });
    });

    test(`editing a draft ${kind} keeps, replaces or clears its prompt line in place`, async () => {
      const { t, admin } = app();
      const draft = await seed(t, { status: "draft", version: 1, brief: "The old line." });
      const theDraft = async () => {
        const all = await rows(t, slug);
        expect(all).toHaveLength(1);
        return all[0];
      };

      await edit(admin, draft, {});
      expect(await theDraft()).toMatchObject({ _id: draft, status: "draft", brief: "The old line." });

      await edit(admin, draft, { brief: "  A new line.  " });
      expect(await theDraft()).toMatchObject({ _id: draft, brief: "A new line." });

      await edit(admin, draft, { brief: "" });
      expect(await theDraft()).not.toHaveProperty("brief");
    });
  }

  test("a style's set form is saved, kept, replaced and cleared the same way, and its prompt line is left alone", async () => {
    const { t, admin } = app();
    const style = kinds[0];
    const edit = (id: AnyId, fields: { brief?: string; form?: string }) =>
      admin.mutation(api.admin.styles.updateStyle, { _id: id as Id<"styles">, id: "either-or", ...styleForm, ...fields });

    await admin.mutation(api.admin.styles.createStyle, { id: "one-word", ...styleForm, form: "  The answer is one word.  " });
    await admin.mutation(api.admin.styles.createStyle, { id: "no-form", ...styleForm, form: " " });
    expect((await style.rows(t, "one-word"))[0].form).toBe("The answer is one word.");
    expect((await style.rows(t, "no-form"))[0]).not.toHaveProperty("form");

    const live = await t.run((ctx) =>
      ctx.db.insert("styles", {
        id: "either-or",
        slug: "either-or",
        ...styleForm,
        status: "active",
        version: 1,
        brief: "The old line.",
        form: "Two options, no lead-in.",
      }),
    );
    const newest = async () => (await style.rows(t, "either-or"))[0];

    await edit(live, {});
    expect(await newest()).toMatchObject({ version: 2, brief: "The old line.", form: "Two options, no lead-in." });

    await edit(live, { form: "  Two options and nothing else.  " });
    expect(await newest()).toMatchObject({ version: 3, brief: "The old line.", form: "Two options and nothing else." });

    await edit(live, { form: "" });
    const cleared = await newest();
    expect(cleared).toMatchObject({ version: 4, status: "draft", brief: "The old line." });
    expect(cleared).not.toHaveProperty("form");

    // Version 4 is a draft, so these edit it in place.
    await edit(cleared._id, { form: "  Two options, no lead-in.  " });
    expect(await newest()).toMatchObject({ _id: cleared._id, brief: "The old line.", form: "Two options, no lead-in." });

    await edit(cleared._id, {});
    expect(await newest()).toMatchObject({ _id: cleared._id, brief: "The old line.", form: "Two options, no lead-in." });

    await edit(cleared._id, { form: " " });
    const draft = await newest();
    expect(draft).toMatchObject({ _id: cleared._id, version: 4, brief: "The old line." });
    expect(draft).not.toHaveProperty("form");
  });

  test("the admin lists return each entry's prompt line, and a style's set form, for the edit forms to show", async () => {
    const { t, admin } = app();
    await t.run(async (ctx) => {
      await ctx.db.insert("styles", {
        id: "either-or",
        slug: "either-or",
        ...styleForm,
        status: "active",
        version: 1,
        brief: "Two everyday things, and the person picks one.",
        form: "Two options, no lead-in.",
      });
      await ctx.db.insert("styles", { id: "open-ended", slug: "open-ended", ...styleForm, name: "Open Ended", status: "active", version: 1 });
      await ctx.db.insert("tones", { id: "warm", slug: "warm", ...toneForm, status: "active", version: 1, brief: "Kind and unhurried." });
      await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", status: "active", version: 1, brief: "Days off." });
    });

    const styles = await admin.query(api.admin.styles.listStyles, {});
    expect(styles.find((style) => style.slug === "either-or")).toMatchObject({
      brief: "Two everyday things, and the person picks one.",
      form: "Two options, no lead-in.",
    });
    const openEnded = styles.find((style) => style.slug === "open-ended");
    expect(openEnded).not.toHaveProperty("brief");
    expect(openEnded).not.toHaveProperty("form");

    expect(await admin.query(api.admin.tones.listTones, {})).toMatchObject([{ slug: "warm", brief: "Kind and unhurried." }]);
    expect(await admin.query(api.admin.topics.listTopics, {})).toMatchObject([{ slug: "weekends", brief: "Days off." }]);
  });

  test("the styles list shows the row the generator reads when a copy with no version is still live beside the rewrite", async () => {
    const { t, admin } = app();
    await t.run(async (ctx) => {
      await ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, name: "Old copy" });
      await ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, status: "active", version: 1, brief: "The rewrite." });
    });

    const styles = await admin.query(api.admin.styles.listStyles, {});

    expect(styles.map((style) => [style.slug, style.name, style.brief])).toEqual([["either-or", "Either/Or", "The rewrite."]]);
  });

  test("activating a version moves a person's hidden entry from a version that was archived by hand, for a style and for a tone", async () => {
    const { t, admin } = app();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com" });
      const oldStyle = await ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, status: "archived", version: 1 });
      const draftStyle = await ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, status: "draft", version: 2 });
      const oldTone = await ctx.db.insert("tones", { id: "warm", slug: "warm", ...toneForm, status: "archived", version: 1 });
      const draftTone = await ctx.db.insert("tones", { id: "warm", slug: "warm", ...toneForm, status: "draft", version: 2 });
      const hiddenStyle = await ctx.db.insert("userStyles", { userId, styleId: oldStyle, status: "hidden", updatedAt: 0 });
      const hiddenTone = await ctx.db.insert("userTones", { userId, toneId: oldTone, status: "hidden", updatedAt: 0 });
      return { draftStyle, draftTone, hiddenStyle, hiddenTone };
    });

    await admin.mutation(api.admin.styles.activateStyleVersion, { id: ids.draftStyle });
    await admin.mutation(api.admin.tones.activateToneVersion, { id: ids.draftTone });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.run(async (ctx) => [await ctx.db.get(ids.hiddenStyle), await ctx.db.get(ids.hiddenTone)] as const);
    expect([after[0]?.styleId, after[1]?.toneId]).toEqual([ids.draftStyle, ids.draftTone]);
  });

  test("an edit of a live style is listed as a draft beside it, so it can be activated, and an activated draft becomes the live row", async () => {
    const { t, admin } = app();
    const liveId = await t.run((ctx) =>
      ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, status: "active", version: 1, brief: "Two things, pick one." }),
    );
    const listed = async () =>
      (await admin.query(api.admin.styles.listStyles, {})).map((style) => [style.status, style.version, style.brief]);
    expect(await listed()).toEqual([["active", 1, "Two things, pick one."]]);

    await admin.mutation(api.admin.styles.updateStyle, { _id: liveId, id: "either-or", ...styleForm, brief: "Two everyday things, and the person picks one." });

    // The live row is still what the generator reads; the edit waits beside it as a draft.
    expect(await listed()).toEqual([
      ["active", 1, "Two things, pick one."],
      ["draft", 2, "Two everyday things, and the person picks one."],
    ]);
    const draft = (await admin.query(api.admin.styles.listStyles, {})).find((style) => style.status === "draft")!;

    // Editing the live row again makes another draft, and the first one stays listed with its edit.
    await admin.mutation(api.admin.styles.updateStyle, { _id: liveId, id: "either-or", ...styleForm, brief: "A third wording." });
    expect(await listed()).toEqual([
      ["active", 1, "Two things, pick one."],
      ["draft", 2, "Two everyday things, and the person picks one."],
      ["draft", 3, "A third wording."],
    ]);

    await admin.mutation(api.admin.styles.activateStyleVersion, { id: draft._id });
    // The other draft is still newer than the row that is live now, so it stays listed beside it.
    expect(await listed()).toEqual([
      ["active", 2, "Two everyday things, and the person picks one."],
      ["draft", 3, "A third wording."],
    ]);

    // A draft older than the live row is not offered: activating it would put a stale version live.
    await t.run(async (ctx) => {
      await ctx.db.insert("styles", { id: "either-or", slug: "either-or", ...styleForm, status: "draft", version: 1, brief: "A stale draft." });
    });
    expect((await listed()).map(([status, version]) => [status, version])).toEqual([
      ["active", 2],
      ["draft", 3],
    ]);
  });

  // Value: protects=a style with no live row is still in the admin's styles list, once: a style just created shows as its draft until it is activated, and a style with only archived versions shows its newest;
  // fails_when=the list returns only styles that have a live row, so a new style can't be found to activate, or it returns every version of a style that has none live;
  // why_new=every styles-list test here starts from a live row, so the list's answer for a style with none was never asked for;
  // seam=none; no_claim=what the page draws for such a row, or how the app's own lists treat a style that isn't live.
  test("a style with no live row is still listed, once: a new style as its draft until it is activated, and an archived style as its newest version", async () => {
    const { t, admin } = app();
    const listed = async () => (await admin.query(api.admin.styles.listStyles, {})).map((style) => [style.slug, style.status, style.version]);

    const created = await admin.mutation(api.admin.styles.createStyle, { id: "one-word", ...styleForm, name: "One Word" });
    expect(await listed()).toEqual([["one-word", "draft", 1]]);

    await admin.mutation(api.admin.styles.activateStyleVersion, { id: created });
    expect(await listed()).toEqual([["one-word", "active", 1]]);

    await t.run(async (ctx) => {
      await ctx.db.insert("styles", { id: "retired", slug: "retired", ...styleForm, name: "Retired", status: "archived", version: 1 });
      await ctx.db.insert("styles", { id: "retired", slug: "retired", ...styleForm, name: "Retired", status: "archived", version: 2 });
    });
    expect(await listed()).toEqual([
      ["one-word", "active", 1],
      ["retired", "archived", 2],
    ]);
  });
});
