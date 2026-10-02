import { describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { runTopicPreviewWithUsage } from "./teamPromptActions";
import { billedFailure, wasAiCallBilled } from "../lib/aiSpendGuard";
import { convexErrorData } from "../lib/errorData";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";

const args = {
  organizationId: "org-id" as any,
  name: "Launch readiness",
  guidance: "Surface unspoken concerns.",
  styleId: "style-id" as any,
  toneId: "tone-id" as any,
};

describe("runTopicPreviewWithUsage", () => {
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

  it("refuses a blank topic name with a readable error before reserving usage", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn();

    const error = await runTopicPreviewWithUsage(ctx, { ...args, name: "  " }, generate).catch((e: unknown) => e);

    expect(convexErrorData(error)).toEqual({
      code: ERROR_CODES.TEAM_TOPIC_REQUIRED,
      message: ERROR_MESSAGES.TEAM_TOPIC_NAME_REQUIRED,
    });
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
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

  it("rejects generated wording that cannot be persisted", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockResolvedValue({
      previewTexts: ["x".repeat(501)],
      runId: "run-id",
    });

    await expect(runTopicPreviewWithUsage(ctx, args, generate)).rejects.toThrow(
      "No persistable topic preview questions were generated",
    );
    expect(ctx.runMutation).toHaveBeenLastCalledWith(
      internal.internal.users.decrementAIUsage,
      { userId: "user-id", organizationId: "org-id" },
    );
  });

  it("rejects incomplete or duplicate three-option responses", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("user-id"),
      runMutation: vi.fn().mockResolvedValue(1),
    } as any;
    const generate = vi.fn().mockResolvedValue({
      previewTexts: ["What should we revisit?", "What should we revisit?"],
      runId: "run-id",
    });

    await expect(runTopicPreviewWithUsage(ctx, args, generate)).rejects.toThrow(
      "Exactly three distinct topic preview questions are required",
    );
    expect(ctx.runMutation).toHaveBeenLastCalledWith(
      internal.internal.users.decrementAIUsage,
      { userId: "user-id", organizationId: "org-id" },
    );
  });
});
