import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { handleAsync } from "./async";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(() => vi.restoreAllMocks());

describe("async UI actions", () => {
  it("runs event handling synchronously and returns void", () => {
    const preventDefault = vi.fn();
    const result = handleAsync(async (event: { preventDefault: () => void }) => {
      event.preventDefault();
      await Promise.resolve();
    })({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });

  it("reports a rejected action rather than leaving an unhandled promise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleAsync(() => Promise.reject(new Error("failed")))();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't complete this action. Try again."));
  });
});
