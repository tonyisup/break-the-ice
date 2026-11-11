import { render, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { ClerkSyncManager } from "./ClerkSyncManager";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as Mock;
const mockUseMutation = useMutation as unknown as Mock;

describe("ClerkSyncManager", () => {
  const storeUser = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    mockUseAuth.mockReturnValue({ isSignedIn: true, isLoaded: true });
    mockUseMutation.mockImplementation((reference) => {
      const functionName = getFunctionName(reference);
      if (functionName === "core/users:store") return storeUser;
      throw new Error(`Unexpected mutation: ${functionName}`);
    });
    storeUser.mockResolvedValue("user_doc_id");
  });

  it("does not store a signed-out user", () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, isLoaded: true });

    render(<ClerkSyncManager />);

    expect(storeUser).not.toHaveBeenCalled();
  });

  it("stores a newly authenticated Clerk user", async () => {
    render(<ClerkSyncManager />);

    await waitFor(() => expect(storeUser).toHaveBeenCalledTimes(1));
  });

  it("asks Convex for nothing about organizations, even with one active in Clerk", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      orgId: "org_123",
      orgRole: "org:admin",
    });

    render(<ClerkSyncManager />);

    await waitFor(() => expect(storeUser).toHaveBeenCalledTimes(1));
    expect(new Set(mockUseMutation.mock.calls.map(([reference]) => getFunctionName(reference)))).toEqual(
      new Set(["core/users:store"]),
    );
  });
});
