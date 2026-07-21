import { describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { runTopicPreviewWithUsage } from "./teamPromptActions";

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
      previewTexts: ["What concern deserves more airtime?"],
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
      questions: ["What concern deserves more airtime?"],
      runId: "run-id",
    });
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
});
