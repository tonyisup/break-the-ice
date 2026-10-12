/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { STYLE_BRIEF_LINES, TONE_BRIEF_LINES, TOPIC_BRIEF_LINES } from "./data/briefLines";

type TestConvex = ReturnType<typeof convexTest>;

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
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

    expect(report.styles).toEqual({ lined: 14, archived: 3 });
    expect(report.tones).toEqual({ lined: 19, archived: 1 });
    expect(report.topics).toEqual({ lined: 8, archived: 0 });
    expect(report.changes).toHaveLength(14 + 3 + 19 + 1 + 8);
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
      { lined: 14, archived: 3 },
      { lined: 19, archived: 1 },
      { lined: 8, archived: 0 },
    ]);
    // Every change is logged, so a row can be put back by hand.
    expect(log.mock.calls.filter(([line]) => /: (line|archived)$/.test(String(line)))).toHaveLength(report.changes.length);

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
      { lined: 0, archived: 0 },
      { lined: 0, archived: 0 },
      { lined: 0, archived: 0 },
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

    expect(report.styles).toEqual({ lined: 3, archived: 0 });
    expect(report.changes.map((change) => [change.slug, change.change]).sort()).toEqual([
      ["micro-ritual", "line"],
      ["micro-ritual", "line"],
      ["would-you-rather", "line"],
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
    // Only a live entry gets a line: a draft is somebody's work in progress.
    expect(after.draft?.brief).toBeUndefined();
    expect(report.noLiveRow).toContain("styles/open-ended");
    expect(report.noLiveRow).toContain("tones/bold");
    expect(report.noLiveRow).not.toContain("styles/desert-island");
  });
});
