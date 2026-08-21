import { afterEach, describe, expect, it, vi } from "vitest";

const createDelayedPostHog = async () => {
  vi.resetModules();

  const posthog = {
    init: vi.fn(),
    capture: vi.fn(),
    has_opted_out_capturing: vi.fn(() => true),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
  };
  let resolvePostHog!: (module: { default: typeof posthog }) => void;
  const delayedModule = new Promise<{ default: typeof posthog }>((resolve) => {
    resolvePostHog = resolve;
  });

  vi.doMock("posthog-js", () => delayedModule);
  const analytics = await import("./analytics");

  return {
    analytics,
    posthog,
    resolvePostHog: () => resolvePostHog({ default: posthog }),
  };
};

afterEach(() => {
  vi.doUnmock("posthog-js");
  vi.resetModules();
});

describe("analytics load queue", () => {
  it("bounds and flushes events captured while PostHog is loading", async () => {
    const { analytics, posthog, resolvePostHog } = await createDelayedPostHog();
    const enablePromise = analytics.enableAnalytics();

    for (let index = 0; index < analytics.MAX_PENDING_ANALYTICS_EVENTS + 5; index += 1) {
      analytics.captureAnalytics(`queued-${index}`, { index });
    }

    expect(posthog.capture).not.toHaveBeenCalled();
    resolvePostHog();
    await enablePromise;

    expect(posthog.init).toHaveBeenCalledOnce();
    expect(posthog.opt_in_capturing).toHaveBeenCalledOnce();
    expect(posthog.capture).toHaveBeenCalledTimes(analytics.MAX_PENDING_ANALYTICS_EVENTS);
    expect(posthog.capture.mock.calls[0]?.[0]).toBe("queued-5");
    expect(posthog.capture.mock.calls.at(-1)?.[0]).toBe("queued-54");
    expect(posthog.opt_in_capturing.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.capture.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("discards queued events when consent is revoked before loading finishes", async () => {
    const { analytics, posthog, resolvePostHog } = await createDelayedPostHog();
    const enablePromise = analytics.enableAnalytics();
    analytics.captureAnalytics("discard-me");

    analytics.disableAnalytics();
    resolvePostHog();
    await enablePromise;

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
