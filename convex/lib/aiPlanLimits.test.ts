import { afterEach, expect, it, vi } from "vitest";
import { getAiPlanLimit } from "./aiPlanLimits";

afterEach(() => vi.unstubAllEnvs());
it("reads the allowance from MAX_FREE_AIGEN, and defaults to 10", () => {
  vi.stubEnv("MAX_FREE_AIGEN", "4");
  expect(getAiPlanLimit()).toBe(4);
  vi.stubEnv("MAX_FREE_AIGEN", undefined);
  expect(getAiPlanLimit()).toBe(10);
});
it("ignores the settings the Team plan used", () => {
  vi.stubEnv("MAX_FREE_AIGEN", "4");
  vi.stubEnv("MAX_TEAM_AIGEN", "73");
  vi.stubEnv("MAX_CASUAL_AIGEN", "41");
  expect(getAiPlanLimit()).toBe(4);
});
it.each(["-1", "1.5", "invalid"])("rejects invalid allowance %s", (value) => {
  vi.stubEnv("MAX_FREE_AIGEN", value);
  expect(() => getAiPlanLimit()).toThrow("Invalid AI allowance");
});
