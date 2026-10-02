import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import { runTopicPreviewWithUsage } from "./teamPromptActions";
import { billedFailure, wasAiCallBilled } from "../lib/aiSpendGuard";
import { convexErrorData } from "../lib/errorData";
import { openRouterClient } from "../lib/generationRunner";
import { DEFAULT_BLUEPRINT_SLUG } from "../lib/promptArchitecture";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_TEAM_TOPIC_BOUNDARIES_LENGTH,
  MAX_TEAM_TOPIC_NAME_LENGTH,
} from "../constants";

const args = {
  organizationId: "org-id" as any,
  name: "Launch readiness",
  guidance: "Surface unspoken concerns.",
  styleId: "style-id" as any,
  toneId: "tone-id" as any,
};

describe("runTopicPreviewWithUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reserves workspace AI usage before generating previews", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockResolvedValue({
      previewTexts: [
        "What concern deserves more airtime?",
        "What assumption should we revisit?",
        "What would make this week feel successful?",
      ],
      runId: "run-id",
    });

    const result = await runTopicPreviewWithUsage(ctx, args, generate);

    expect(ctx.runMutation).toHaveBeenNthCalledWith(
      1,
      internal.internal.users.checkAndIncrementAIUsage,
      { userId: "user-id", organizationId: "org-id" },
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(result).toEqual({
      questions: [
        "What concern deserves more airtime?",
        "What assumption should we revisit?",
        "What would make this week feel successful?",
      ],
      runId: "run-id",
    });
  });

  it("sends the topic fields to generation and leaves out absent boundaries", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockResolvedValue({
      previewTexts: ["One?", "Two?", "Three?"],
      runId: "run-id",
    });

    await runTopicPreviewWithUsage(ctx, { ...args, boundaries: undefined }, generate);

    const { userContext } = generate.mock.calls[0][1];
    expect(userContext).toContain("Team conversation topic: Launch readiness\n");
    expect(userContext).toContain("Desired outcome: Surface unspoken concerns.\n");
    expect(userContext).not.toContain("Boundaries:");
  });

  it("restores reserved usage when preview generation fails", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockRejectedValue(new Error("provider failed"));

    await expect(runTopicPreviewWithUsage(ctx, args, generate)).rejects.toThrow(
      "provider failed",
    );

    expect(ctx.runMutation).toHaveBeenLastCalledWith(
      internal.internal.users.decrementAIUsage,
      { userId: "user-id", organizationId: "org-id" },
    );
  });

  it("keeps reserved usage when the failed preview was already paid for", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockRejectedValue(billedFailure(new Error("unparseable JSON")));

    const error = await runTopicPreviewWithUsage(ctx, args, generate).catch((e: unknown) => e);
    expect(wasAiCallBilled(error)).toBe(true);

    // Only the usage charge ran; no refund followed.
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a blank topic name", { name: "   " }, ERROR_CODES.TEAM_TOPIC_REQUIRED, ERROR_MESSAGES.TEAM_TOPIC_NAME_REQUIRED],
    [
      "over-long boundaries",
      { boundaries: "x".repeat(MAX_TEAM_TOPIC_BOUNDARIES_LENGTH + 1) },
      ERROR_CODES.TEAM_TOPIC_TOO_LONG,
      ERROR_MESSAGES.TEAM_TOPIC_BOUNDARIES_TOO_LONG,
    ],
  ])("checks the topic fields itself and refuses %s before reserving usage", async (_case, override, code, message) => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn();

    const error = await runTopicPreviewWithUsage(ctx, { ...args, ...override }, generate).catch((e: unknown) => e);

    expect(convexErrorData(error)).toEqual({ code, message });
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("logs why the preview options could not be used", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockResolvedValue({
      previewTexts: ["What should we revisit?", "What should we revisit?", "x".repeat(501)],
      runId: "run-id",
    });

    await runTopicPreviewWithUsage(ctx, args, generate).catch(() => {});

    expect(warn).toHaveBeenCalledWith("Topic preview options could not be used", {
      runId: "run-id",
      generated: 3,
      persistable: 2,
      distinct: 1,
    });
  });

  it.each([
    ["wording that cannot be persisted", ["x".repeat(501)]],
    ["incomplete or duplicate options", ["What should we revisit?", "What should we revisit?"]],
  ])("refuses %s readably and keeps the paid usage", async (_case, previewTexts) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockResolvedValue({ previewTexts, runId: "run-id" });

    const error = await runTopicPreviewWithUsage(ctx, args, generate).catch((e: unknown) => e);

    expect(convexErrorData(error)).toEqual({
      code: ERROR_CODES.AI_GENERATION_FAILED,
      message: ERROR_MESSAGES.AI_GENERATION_FAILED,
      billed: true,
    });
    // Only the usage charge ran; no refund followed.
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });
});

// The action end to end under convex-test, so refusals cross the function boundary the
// way they reach the client. The model call is stubbed and must not be reached.
describe("previewTopicQuestions", () => {
  const MANAGER = { subject: "preview-manager", tokenIdentifier: "test|preview-manager", email: "preview-manager@example.com" };
  const validTopic = { name: "Launch readiness", guidance: "Surface unspoken concerns." };
  let create: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    create = vi.spyOn(openRouterClient.chat.completions, "create");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function setup() {
    const t = convexTest(schema, convexFunctionModules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert("promptBlueprints", {
        slug: DEFAULT_BLUEPRINT_SLUG,
        version: 1,
        status: "active",
        systemInstruction: "",
        safetyChecklist: [],
        qualityChecklist: [],
        outputFormatInstruction: "",
        createdAt: 0,
        updatedAt: 0,
      });
      const userId = await ctx.db.insert("users", { email: MANAGER.email, clerkId: MANAGER.subject });
      const organizationId = await ctx.db.insert("organizations", { name: "Launch Crew", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId, organizationId, role: "manager" });
      const otherOrganizationId = await ctx.db.insert("organizations", { name: "Other Crew", planTier: "team", billingStatus: "active" });
      const style = { name: "Reflective", structure: "Ask for a reflection", color: "#111111", icon: "sparkles" };
      const styleId = await ctx.db.insert("styles", { id: "reflective", ...style });
      const otherOrganizationStyleId = await ctx.db.insert("styles", { id: "other-reflective", ...style, organizationId: otherOrganizationId });
      const toneId = await ctx.db.insert("tones", { id: "warm", name: "Warm", promptGuidanceForAI: "Be warm", color: "#222222", icon: "sun" });
      return { userId, organizationId, styleId, otherOrganizationStyleId, toneId };
    });
    return { t, ...ids };
  }

  it("refuses another workspace's style with a readable error after crossing the action boundary", async () => {
    const { t, organizationId, otherOrganizationStyleId, toneId } = await setup();

    const error = await t
      .withIdentity(MANAGER)
      .action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId,
        ...validTopic,
        styleId: otherOrganizationStyleId,
        toneId,
      })
      .catch((caught: unknown) => caught);

    expect(convexErrorData(error)).toEqual({
      code: ERROR_CODES.STYLE_UNAVAILABLE,
      message: ERROR_MESSAGES.STYLE_UNAVAILABLE,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["a blank topic name", { name: "  " }, ERROR_CODES.TEAM_TOPIC_REQUIRED, ERROR_MESSAGES.TEAM_TOPIC_NAME_REQUIRED],
    ["blank guidance", { guidance: "\n " }, ERROR_CODES.TEAM_TOPIC_REQUIRED, ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_REQUIRED],
    [
      "an over-long topic name",
      { name: "a".repeat(MAX_TEAM_TOPIC_NAME_LENGTH + 1) },
      ERROR_CODES.TEAM_TOPIC_TOO_LONG,
      ERROR_MESSAGES.TEAM_TOPIC_NAME_TOO_LONG,
    ],
    [
      "over-long boundaries",
      { boundaries: "a".repeat(MAX_TEAM_TOPIC_BOUNDARIES_LENGTH + 1) },
      ERROR_CODES.TEAM_TOPIC_TOO_LONG,
      ERROR_MESSAGES.TEAM_TOPIC_BOUNDARIES_TOO_LONG,
    ],
  ])("refuses %s with a readable error before the AI rate limit or usage is charged", async (_label, override, code, message) => {
    const { t, organizationId, styleId, toneId } = await setup();

    const error = await t
      .withIdentity(MANAGER)
      .action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId,
        ...validTopic,
        ...override,
        styleId,
        toneId,
      })
      .catch((caught: unknown) => caught);

    expect(convexErrorData(error)).toEqual({ code, message });
    const charged = await t.run(async (ctx) => ({
      rateLimits: await ctx.db.query("rateLimits").collect(),
      usage: await ctx.db.query("userAiUsage").collect(),
    }));
    expect(charged).toEqual({ rateLimits: [], usage: [] });
    expect(create).not.toHaveBeenCalled();
  });

  it("sends trimmed topic fields to the model and leaves out blank boundaries", async () => {
    const { t, organizationId, styleId, toneId } = await setup();
    create.mockRejectedValue(new Error("provider failed"));

    await t
      .withIdentity(MANAGER)
      .action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId,
        name: "  Launch readiness ",
        guidance: "\tSurface unspoken concerns.\n",
        boundaries: "   ",
        styleId,
        toneId,
      })
      .catch(() => undefined);

    const prompt = JSON.stringify(create.mock.calls[0][0]);
    expect(prompt).toContain("Team conversation topic: Launch readiness\\n");
    expect(prompt).toContain("Desired outcome: Surface unspoken concerns.\\n");
    expect(prompt).not.toContain("Boundaries:");
  });
});
