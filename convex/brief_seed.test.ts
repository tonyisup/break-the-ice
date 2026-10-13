/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { STYLE_BRIEF_LINES, TONE_BRIEF_LINES, TOPIC_BRIEF_LINES } from "./data/briefLines";
import { openRouterClient } from "./lib/generationRunner";

type TestConvex = ReturnType<typeof convexTest>;

const modules = import.meta.glob("./**/*.ts");

// A real run schedules the batches that move questions and hidden entries off an archived copy.
// With the clock faked they run only where a test asks them to, and neither provider can be
// reached from scheduled work.
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(openRouterClient.chat.completions, "create").mockRejectedValue(new Error("unexpected model call"));
  vi.spyOn(OpenAI.Embeddings.prototype, "create").mockRejectedValue(new Error("unexpected embedding call"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const STYLES = Object.keys(STYLE_BRIEF_LINES);
const TONES = Object.keys(TONE_BRIEF_LINES);
const TOPICS = Object.keys(TOPIC_BRIEF_LINES);
// Production has a second live row, from before versions existed, for these.
const DOUBLED_STYLES = ["if-this-but-that", "open-ended", "would-you-rather"];
const DOUBLED_TONES = ["nostalgic"];
const SEASONAL_TOPICS = ["spring-reset", "summer-break", "year-end"];

const style = (slug: string, fields: Partial<Doc<"styles">> = {}) => ({
  id: slug,
  slug,
  name: `Style ${slug}`,
  description: `The old description of ${slug}.`,
  structure: "",
  color: "#000",
  icon: "x",
  status: "active" as const,
  version: 1,
  ...fields,
});
const tone = (slug: string, fields: Partial<Doc<"tones">> = {}) => ({
  id: slug,
  slug,
  name: `Tone ${slug}`,
  color: "#000",
  icon: "x",
  promptGuidanceForAI: "",
  status: "active" as const,
  version: 1,
  ...fields,
});
const topic = (slug: string, fields: Partial<Doc<"topics">> = {}) => ({
  id: slug,
  slug,
  name: `Topic ${slug}`,
  description: `About ${slug}.`,
  status: "active" as const,
  version: 1,
  ...fields,
});

/** The live lists as production has them: every slug once, a few twice, and two archived styles. */
async function productionLists(t: TestConvex) {
  await t.run(async (ctx) => {
    for (const slug of DOUBLED_STYLES) await ctx.db.insert("styles", style(slug, { version: undefined, name: `Old ${slug}` }));
    for (const slug of STYLES) await ctx.db.insert("styles", style(slug));
    for (const slug of ["domain-swap", "one-word-whip"]) await ctx.db.insert("styles", style(slug, { status: "archived" }));
    for (const slug of DOUBLED_TONES) await ctx.db.insert("tones", tone(slug, { version: undefined }));
    for (const slug of TONES) await ctx.db.insert("tones", tone(slug));
    for (const slug of [...TOPICS, ...SEASONAL_TOPICS]) await ctx.db.insert("topics", topic(slug));
  });
}

const rows = (t: TestConvex) =>
  t.run(async (ctx) => ({
    styles: await ctx.db.query("styles").collect(),
    tones: await ctx.db.query("tones").collect(),
    topics: await ctx.db.query("topics").collect(),
  }));
const seed = (t: TestConvex, dryRun: boolean) => t.mutation(internal.internal.migrations.seedBriefLines, { dryRun });

describe("seeding the brief's lines", () => {
  test("a dry run reports every line and every outdated copy, and writes nothing", async () => {
    const t = convexTest(schema, modules);
    await productionLists(t);
    const before = await rows(t);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const report = await seed(t, true);

    expect(report.styles).toEqual({ lined: 14, drafts: 0, archived: 3 });
    expect(report.tones).toEqual({ lined: 19, drafts: 0, archived: 1 });
    expect(report.topics).toEqual({ lined: 8, drafts: 0, archived: 0 });
    expect(report.changes).toHaveLength(14 + 3 + 19 + 1 + 8);
    // Each archived copy names the live row that takes over what points at it.
    const numbered = new Map(before.styles.filter((row) => row.version === 1 && row.status === "active").map((row) => [row.slug, row._id]));
    expect(report.changes.filter((change) => change.table === "styles" && change.change === "archived").map((change) => [change.slug, change.replacedBy]).sort()).toEqual(
      DOUBLED_STYLES.map((slug) => [slug, numbered.get(slug)]).sort(),
    );
    // And each line says which fields it writes: a set-form style gets both.
    expect(report.changes.find((change) => change.change === "line" && change.slug === "would-you-rather")?.wrote).toBe("brief and form");
    expect(report.changes.find((change) => change.change === "line" && change.slug === "desert-island")?.wrote).toBe("brief");
    expect(report.changes.filter((change) => change.change === "archived").map((change) => `${change.table}/${change.slug}`).sort()).toEqual([
      "styles/if-this-but-that",
      "styles/open-ended",
      "styles/would-you-rather",
      "tones/nostalgic",
    ]);
    expect(report.noLiveRow).toEqual([]);
    // A seasonal topic has no line: it keeps being read by its description.
    expect(report.noLine).toEqual(SEASONAL_TOPICS.map((slug) => `topics/${slug}`));
    expect(await rows(t)).toEqual(before);
  });

  test("a real run gives each live entry its line, a set-form style its form, and archives the copy with no version; a second run changes nothing", async () => {
    const t = convexTest(schema, modules);
    await productionLists(t);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const report = await seed(t, false);
    expect([report.styles, report.tones, report.topics]).toEqual([
      { lined: 14, drafts: 0, archived: 3 },
      { lined: 19, drafts: 0, archived: 1 },
      { lined: 8, drafts: 0, archived: 0 },
    ]);
    // Every change is logged with what was written, so a row can be put back by hand.
    expect(log.mock.calls.filter(([line]) => /: (line \((brief|form|brief and form)\)|archived, replaced by \S+)$/.test(String(line)))).toHaveLength(report.changes.length);

    const after = await rows(t);
    const live = <T extends { status?: string }>(list: T[]) => list.filter((row) => row.status === "active");
    expect(live(after.styles).map((row) => [row.slug, row.version, row.brief, row.form]).sort()).toEqual(
      STYLES.map((slug) => [slug, 1, STYLE_BRIEF_LINES[slug].brief, STYLE_BRIEF_LINES[slug].form]).sort(),
    );
    expect(live(after.tones).map((row) => [row.slug, row.brief]).sort()).toEqual(TONES.map((slug) => [slug, TONE_BRIEF_LINES[slug].brief]).sort());
    expect(live(after.topics).map((row) => [row.slug, row.brief]).sort()).toEqual(
      [...TOPICS.map((slug) => [slug, TOPIC_BRIEF_LINES[slug].brief]), ...SEASONAL_TOPICS.map((slug) => [slug, undefined])].sort(),
    );
    // The archived copies are the ones with no version, and they get no line.
    const archivedNow = after.styles.filter((row) => row.status === "archived" && DOUBLED_STYLES.includes(row.slug ?? ""));
    expect(archivedNow.map((row) => [row.version, row.brief])).toEqual(DOUBLED_STYLES.map(() => [undefined, undefined]));
    expect(after.tones.filter((row) => row.status === "archived").map((row) => [row.slug, row.version])).toEqual([["nostalgic", undefined]]);

    // The rewrite is what a prompt is built from now.
    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, { styleSlug: "would-you-rather", toneSlug: "nostalgic" });
    expect(prompt.userPrompt.split("\n")[0]).toBe(
      `Style: Style would-you-rather. ${STYLE_BRIEF_LINES["would-you-rather"].brief} Set form: ${STYLE_BRIEF_LINES["would-you-rather"].form}`,
    );

    const again = await seed(t, false);
    expect([again.styles, again.tones, again.topics]).toEqual([
      { lined: 0, drafts: 0, archived: 0 },
      { lined: 0, drafts: 0, archived: 0 },
      { lined: 0, drafts: 0, archived: 0 },
    ]);
    expect(again.changes).toEqual([]);
    expect(await rows(t)).toEqual(after);
  });

  test("a line an admin wrote stays, a team's own style is left alone, and a line with no live row is reported", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ids = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { name: "Team" });
      return {
        written: await ctx.db.insert("styles", style("desert-island", { brief: "The owner's own line." })),
        formOnly: await ctx.db.insert("styles", style("would-you-rather", { brief: "Kept.", form: "  " })),
        team: await ctx.db.insert("styles", style("open-ended", { organizationId })),
        // Two copies from before versions existed: neither is the rewrite, so both stay live.
        first: await ctx.db.insert("styles", style("micro-ritual", { version: undefined })),
        second: await ctx.db.insert("styles", style("micro-ritual", { version: undefined })),
        draft: await ctx.db.insert("tones", tone("bold", { status: "draft" })),
      };
    });

    const report = await seed(t, false);

    expect(report.styles).toEqual({ lined: 3, drafts: 0, archived: 0 });
    expect(report.tones).toEqual({ lined: 0, drafts: 1, archived: 0 });
    expect(report.changes.map((change) => [change.table, change.slug, change.change, change.wrote]).sort()).toEqual([
      ["styles", "micro-ritual", "line", "brief"],
      ["styles", "micro-ritual", "line", "brief"],
      // This row had an admin's line and a blank form, so only the form was written.
      ["styles", "would-you-rather", "line", "form"],
      ["tones", "bold", "line", "brief"],
    ]);
    const after = await t.run(async (ctx) => ({
      written: await ctx.db.get(ids.written),
      formOnly: await ctx.db.get(ids.formOnly),
      team: await ctx.db.get(ids.team),
      first: await ctx.db.get(ids.first),
      second: await ctx.db.get(ids.second),
      draft: await ctx.db.get(ids.draft),
    }));
    expect(after.written).toMatchObject({ brief: "The owner's own line.", status: "active" });
    expect(after.formOnly).toMatchObject({ brief: "Kept.", form: STYLE_BRIEF_LINES["would-you-rather"].form });
    expect(after.team?.brief).toBeUndefined();
    expect([after.first?.status, after.second?.status]).toEqual(["active", "active"]);
    expect([after.first?.brief, after.second?.brief]).toEqual([STYLE_BRIEF_LINES["micro-ritual"].brief, STYLE_BRIEF_LINES["micro-ritual"].brief]);
    // A draft gets its line too, and stays a draft: activating it later must not drop the line.
    expect(after.draft).toMatchObject({ brief: TONE_BRIEF_LINES.bold.brief, status: "draft" });
    expect(report.changes.filter((change) => change.table === "tones")).toEqual([
      { table: "tones", id: ids.draft, slug: "bold", change: "line", wrote: "brief", draft: true },
    ]);
    expect(report.noLiveRow).toContain("styles/open-ended");
    expect(report.noLiveRow).toContain("tones/bold");
    expect(report.noLiveRow).not.toContain("styles/desert-island");
  });

  test("what pointed at an archived copy moves to the live row: questions, and people's hidden styles and tones", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ids = await t.run(async (ctx) => {
      const oldStyle = await ctx.db.insert("styles", style("would-you-rather", { version: undefined, name: "Old copy" }));
      // The rewrite's status was never written out; it counts as live all the same.
      const { status: _status, ...unstated } = style("would-you-rather");
      const liveStyle = await ctx.db.insert("styles", unstated);
      const oldTone = await ctx.db.insert("tones", tone("nostalgic", { version: undefined }));
      const liveTone = await ctx.db.insert("tones", tone("nostalgic"));
      const question = await ctx.db.insert("questions", {
        text: "Would you rather fly or swim?",
        status: "public",
        style: "would-you-rather",
        styleId: oldStyle,
        tone: "nostalgic",
        toneId: oldTone,
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });
      const userId = await ctx.db.insert("users", { email: "reader@example.com" });
      const hiddenStyle = await ctx.db.insert("userStyles", { userId, styleId: oldStyle, status: "hidden", updatedAt: 0 });
      const hiddenTone = await ctx.db.insert("userTones", { userId, toneId: oldTone, status: "hidden", updatedAt: 0 });
      return { oldStyle, liveStyle, oldTone, liveTone, question, hiddenStyle, hiddenTone };
    });

    // A dry run names where each archived copy's rows would go, and moves nothing.
    const planned = await seed(t, true);
    expect(planned.changes.filter((change) => change.change === "archived").map((change) => [change.id, change.replacedBy])).toEqual([
      [ids.oldStyle, ids.liveStyle],
      [ids.oldTone, ids.liveTone],
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(ids.question)))?.styleId).toBe(ids.oldStyle);

    await seed(t, false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.run(async (ctx) => ({
      question: await ctx.db.get(ids.question),
      hiddenStyle: await ctx.db.get(ids.hiddenStyle),
      hiddenTone: await ctx.db.get(ids.hiddenTone),
      oldStyle: await ctx.db.get(ids.oldStyle),
      liveStyle: await ctx.db.get(ids.liveStyle),
    }));
    expect([after.oldStyle?.status, after.liveStyle?.status]).toEqual(["archived", "active"]);
    expect(after.question).toMatchObject({ styleId: ids.liveStyle, toneId: ids.liveTone, style: "would-you-rather", tone: "nostalgic" });
    // A hidden style or tone is stored by id: left on the archived copy, the settings page would drop it.
    expect([after.hiddenStyle?.styleId, after.hiddenTone?.toneId]).toEqual([ids.liveStyle, ids.liveTone]);
    // The question's card looks its style up by id, and the lists show the same row.
    expect(await t.query(api.core.styles.getStyleById, { id: after.question!.styleId! })).toMatchObject({ _id: ids.liveStyle });
    expect((await t.query(api.core.styles.getStyles, {})).map((row) => row._id)).toEqual([ids.liveStyle]);
  });

  // Value: protects=a topic's copy from before versions is archived by the seed, and the questions written under it move to the live topic, whose status is written out so the move can run;
  // fails_when=the seed archives a topic's copy and leaves its questions on the archived row, moves another topic's questions, or moves anything on a dry run;
  // why_new=the test above moves a style's and a tone's rows, and the production-shaped lists have no doubled topic, so the topic's own batch was never scheduled in a test;
  // seam=none; no_claim=a library larger than one batch (three questions here), or what a model would be sent: both clients are stubbed and must not be called.
  test("a topic's copy from before versions is archived too, and the questions written under it move to the live topic, leaving another topic's alone", async () => {
    const t = convexTest(schema, modules);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // The batches that move questions call no model. These stop a call from leaving the machine if one ever did.
    const model = vi.spyOn(openRouterClient.chat.completions, "create").mockRejectedValue(new Error("unexpected model call"));
    const embedding = vi.spyOn(OpenAI.Embeddings.prototype, "create").mockRejectedValue(new Error("unexpected embedding call"));
    const ids = await t.run(async (ctx) => {
      const oldTopic = await ctx.db.insert("topics", topic("food", { version: undefined, name: "Old copy" }));
      // The rewrite's status was never written out; it counts as live all the same.
      const { status: _status, ...unstated } = topic("food");
      const liveTopic = await ctx.db.insert("topics", unstated);
      const otherTopic = await ctx.db.insert("topics", topic("music"));
      const question = (text: string, slug: string, topicId: Id<"topics">) =>
        ctx.db.insert("questions", { text, status: "public", topic: slug, topicId, totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
      return {
        oldTopic,
        liveTopic,
        otherTopic,
        underOldCopy: await question("Which snack do you always come back to?", "food", oldTopic),
        underLiveRow: await question("What did you eat for breakfast today?", "food", liveTopic),
        underOtherTopic: await question("Which song do you never skip?", "music", otherTopic),
      };
    });
    /** The topic row each question points at: the one under the old copy, the one under the live row, the other topic's. */
    const topicIds = () =>
      t.run(async (ctx) => Promise.all([ids.underOldCopy, ids.underLiveRow, ids.underOtherTopic].map(async (id) => (await ctx.db.get(id))?.topicId)));

    // A dry run names the live row the copy's questions would go to, and moves nothing.
    const planned = await seed(t, true);
    expect(planned.changes.filter((change) => change.change === "archived")).toEqual([
      { table: "topics", id: ids.oldTopic, slug: "food", change: "archived", replacedBy: ids.liveTopic },
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await topicIds()).toEqual([ids.oldTopic, ids.liveTopic, ids.otherTopic]);

    const report = await seed(t, false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(report.topics).toEqual({ lined: 2, drafts: 0, archived: 1 });
    // The log says where the copy's questions went, for putting a row back by hand.
    expect(log).toHaveBeenCalledWith(`seedBriefLines topics/food ${ids.oldTopic}: archived, replaced by ${ids.liveTopic}`);
    const after = await t.run(async (ctx) => ({
      old: await ctx.db.get(ids.oldTopic),
      live: await ctx.db.get(ids.liveTopic),
      moved: await ctx.db.get(ids.underOldCopy),
    }));
    expect([after.old?.status, after.old?.brief]).toEqual(["archived", undefined]);
    expect(after.live).toMatchObject({ status: "active", brief: TOPIC_BRIEF_LINES.food.brief });
    expect(await topicIds()).toEqual([ids.liveTopic, ids.liveTopic, ids.otherTopic]);
    expect(after.moved).toMatchObject({ topic: "food", topicSlug: "food", topicVersion: 1 });
    expect(model).not.toHaveBeenCalled();
    expect(embedding).not.toHaveBeenCalled();
  });

  test("a copy that has only the old id, with no slug, status or version, is archived beside its rewrite", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ids = await t.run(async (ctx) => ({
      old: await ctx.db.insert("styles", { id: "open-ended", name: "Old open-ended", structure: "", color: "#000", icon: "x" }),
      rewrite: await ctx.db.insert("styles", style("open-ended")),
    }));

    const report = await seed(t, false);

    expect(report.styles).toEqual({ lined: 1, drafts: 0, archived: 1 });
    const after = await t.run(async (ctx) => ({ old: await ctx.db.get(ids.old), rewrite: await ctx.db.get(ids.rewrite) }));
    expect([after.old?.status, after.old?.brief]).toEqual(["archived", undefined]);
    expect(after.rewrite).toMatchObject({ status: "active", brief: STYLE_BRIEF_LINES["open-ended"].brief });
  });

  test("a draft made before the seed keeps the style's line and set form when it is activated afterwards", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const draft = await t.run(async (ctx) => {
      await ctx.db.insert("styles", style("would-you-rather"));
      await ctx.db.insert("tones", tone("nostalgic"));
      return await ctx.db.insert("styles", style("would-you-rather", { description: "The draft's description.", status: "draft", version: 2 }));
    });

    const report = await seed(t, false);
    expect(report.styles).toEqual({ lined: 1, drafts: 1, archived: 0 });
    await t.withIdentity({ subject: "admin", tokenIdentifier: "test|admin", metadata: { isAdmin: "true" } }).mutation(api.admin.styles.activateStyleVersion, { id: draft });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, { styleSlug: "would-you-rather", toneSlug: "nostalgic" });
    expect(prompt.userPrompt.split("\n")[0]).toBe(
      `Style: Style would-you-rather. ${STYLE_BRIEF_LINES["would-you-rather"].brief} Set form: ${STYLE_BRIEF_LINES["would-you-rather"].form}`,
    );
  });
});
