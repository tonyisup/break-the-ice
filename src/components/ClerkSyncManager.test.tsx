import { render, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAuth, useOrganization } from "@clerk/clerk-react";
import { useAction, useMutation } from "convex/react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ClerkSyncManager } from "./ClerkSyncManager";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(),
  useOrganization: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as Mock;
const mockUseOrganization = useOrganization as unknown as Mock;
const mockUseMutation = useMutation as unknown as Mock;
const mockUseAction = useAction as unknown as Mock;
const mockUseWorkspace = useWorkspace as unknown as Mock;

describe("ClerkSyncManager", () => {
  const storeUser = vi.fn();
  const syncOrganization = vi.fn();
  const syncOrganizationViaClerkApi = vi.fn();
  const setActiveWorkspace = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      orgId: null,
      orgRole: null,
    });
    mockUseOrganization.mockReturnValue({
      organization: null,
      isLoaded: true,
    });
    mockUseWorkspace.mockReturnValue({
      workspaceHydrated: true,
      setActiveWorkspace,
    });
    mockUseMutation.mockImplementation((reference) => {
      const functionName = getFunctionName(reference);
      if (functionName === "core/users:store") return storeUser;
      if (functionName === "core/billing:syncOrganizationFromClerk") {
        return syncOrganization;
      }
      throw new Error(`Unexpected mutation: ${functionName}`);
    });
    mockUseAction.mockReturnValue(syncOrganizationViaClerkApi);
    storeUser.mockResolvedValue("user_doc_id");
  });

  it("clears the active workspace and does not store a signed-out user", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      orgId: null,
      orgRole: null,
    });

    render(<ClerkSyncManager />);

    await waitFor(() => expect(setActiveWorkspace).toHaveBeenCalledWith(null));
    expect(storeUser).not.toHaveBeenCalled();
    expect(syncOrganization).not.toHaveBeenCalled();
  });

  it("stores a newly authenticated Clerk user and selects personal workspace", async () => {
    render(<ClerkSyncManager />);

    await waitFor(() => expect(storeUser).toHaveBeenCalledTimes(1));
    expect(setActiveWorkspace).toHaveBeenCalledWith(null);
    expect(syncOrganization).not.toHaveBeenCalled();
  });

  it("waits for Clerk and workspace hydration before syncing an organization", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: false,
      orgId: "org_123",
      orgRole: "org:admin",
    });
    mockUseOrganization.mockReturnValue({
      organization: { name: "Acme" },
      isLoaded: true,
    });
    mockUseWorkspace.mockReturnValue({
      workspaceHydrated: false,
      setActiveWorkspace,
    });

    render(<ClerkSyncManager />);

    await waitFor(() => expect(storeUser).toHaveBeenCalledTimes(1));
    expect(syncOrganization).not.toHaveBeenCalled();
    expect(syncOrganizationViaClerkApi).not.toHaveBeenCalled();
  });

  it("selects the Convex organization returned by JWT-based sync", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      orgId: "org_123",
      orgRole: "org:admin",
    });
    mockUseOrganization.mockReturnValue({
      organization: { name: "Acme" },
      isLoaded: true,
    });
    syncOrganization.mockResolvedValue("convex_org_id");

    render(<ClerkSyncManager />);

    await waitFor(() =>
      expect(setActiveWorkspace).toHaveBeenCalledWith("convex_org_id"),
    );
    expect(syncOrganization).toHaveBeenCalledWith({});
    expect(syncOrganizationViaClerkApi).not.toHaveBeenCalled();
  });

  it("falls back to Clerk's API when the JWT has no organization claims", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      orgId: "org_123",
      orgRole: "org:member",
    });
    mockUseOrganization.mockReturnValue({
      organization: { name: "Acme" },
      isLoaded: true,
    });
    syncOrganization.mockResolvedValue(null);
    syncOrganizationViaClerkApi.mockResolvedValue("fallback_org_id");

    render(<ClerkSyncManager />);

    await waitFor(() =>
      expect(setActiveWorkspace).toHaveBeenCalledWith("fallback_org_id"),
    );
    expect(syncOrganizationViaClerkApi).toHaveBeenCalledWith({
      clerkOrganizationId: "org_123",
      organizationName: "Acme",
    });
  });

  it("returns to personal workspace when organization sync fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      orgId: "org_123",
      orgRole: "org:member",
    });
    mockUseOrganization.mockReturnValue({
      organization: { name: "Acme" },
      isLoaded: true,
    });
    syncOrganization.mockRejectedValue(new Error("sync failed"));

    render(<ClerkSyncManager />);

    await waitFor(() => expect(setActiveWorkspace).toHaveBeenCalledWith(null));
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to sync organization from Clerk:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
