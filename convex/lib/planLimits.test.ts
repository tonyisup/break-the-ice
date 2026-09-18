import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { convexFunctionModules } from "../../vitestConvexModules";
import { getPlanAiLimit } from "./planLimits";
import { checkAndIncrementAiUsageForWorkspace } from "./aiUsageWorkspace";

afterEach(() => { vi.unstubAllEnvs(); });

test("public allowances and enforcement share the configured Free limit", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "1");
  vi.stubEnv("MAX_TEAM_AIGEN", "42");
  const t = convexTest(schema, convexFunctionModules);
  expect(await t.query(api.core.billing.getPublicPlanLimits, {})).toEqual({ free: 1, team: 42, cycleDays: 30 });
  const userId = await t.run(ctx => ctx.db.insert("users", { email: "limits@example.com" }));
  await t.run(ctx => checkAndIncrementAiUsageForWorkspace(ctx, userId));
  await expect(t.run(ctx => checkAndIncrementAiUsageForWorkspace(ctx, userId))).rejects.toThrow();
});

test("retains the legacy Team setting and supports explicitly disabling generations", () => {
  vi.stubEnv("MAX_TEAM_AIGEN", undefined);
  vi.stubEnv("MAX_CASUAL_AIGEN", "25");
  vi.stubEnv("MAX_FREE_AIGEN", "0");
  expect(getPlanAiLimit("team")).toBe(25);
  expect(getPlanAiLimit("free")).toBe(0);
});

test.each(["", "invalid", "-5", "2.5"])("invalid limit %s falls back to the plan default", value => {
  vi.stubEnv("MAX_FREE_AIGEN", value);
  expect(getPlanAiLimit("free")).toBe(10);
});
