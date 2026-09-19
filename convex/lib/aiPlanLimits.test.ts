import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { getAiPlanLimit } from "./aiPlanLimits";
import schema from "../schema";
import { api } from "../_generated/api";
import { convexFunctionModules } from "../../vitestConvexModules";

afterEach(() => vi.unstubAllEnvs());
it("publishes the same configured limits used by enforcement without authentication", async () => {
  vi.stubEnv("MAX_TEAM_AIGEN", "73");
  vi.stubEnv("MAX_FREE_AIGEN", "4");
  const t = convexTest(schema, convexFunctionModules);
  expect(await t.query(api.core.billing.getPublicPlanLimits, {})).toEqual({
    team: getAiPlanLimit("team"),
    free: getAiPlanLimit("free"),
    cycleDays: 30,
  });
  expect(getAiPlanLimit("team")).toBe(73);
});
it("uses the legacy team allowance when the current setting is absent", () => {
  vi.stubEnv("MAX_TEAM_AIGEN", undefined);
  vi.stubEnv("MAX_CASUAL_AIGEN", "41");
  expect(getAiPlanLimit("team")).toBe(41);
});
it.each(["-1", "1.5", "invalid"])("rejects invalid allowance %s", (value) => {
  vi.stubEnv("MAX_FREE_AIGEN", value);
  expect(() => getAiPlanLimit("free")).toThrow("Invalid AI allowance");
});
