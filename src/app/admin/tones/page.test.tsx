import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import TonesPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    admin: {
      tones: {
        listTones: "listTones",
        createTone: "createTone",
        updateTone: "updateTone",
        deleteTone: "deleteTone",
        activateToneVersion: "activateToneVersion",
      },
    },
  },
}));

const warm = {
  _id: "tone-1",
  _creationTime: 1,
  id: "warm",
  slug: "warm",
  name: "Warm",
  description: "Friendly and kind.",
  color: "#111111",
  icon: "Music",
  promptGuidanceForAI: "Be warm",
  order: 1,
  version: 2,
  status: "active",
  brief: "Kind and unhurried, like a friend asking.",
};

const NOT_SENT = "Not sent to the AI when it writes questions; the Prompt Line is. Still used to match questions to people.";
const DRAFT_SAVED = "Saved as a new draft version. Activate it for the AI to use it.";

describe("admin tones: the prompt line", () => {
  const createTone = vi.fn();
  const updateTone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createTone.mockResolvedValue("tone-2");
    updateTone.mockResolvedValue(null);
    vi.mocked(useQuery).mockReturnValue([warm]);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "createTone" ? createTone : name === "updateTone" ? updateTone : vi.fn()) as never);
  });

  async function openEditForm(statusLine = "active v2") {
    render(<TonesPage />);
    const row = screen.getByText(statusLine).closest("tr")!;
    expect(within(row).getByText("Warm")).toBeInTheDocument();
    fireEvent.click(row.querySelector(".lucide-pencil")!.closest("button")!);
    return await screen.findByLabelText("Prompt Line (Optional)");
  }

  it("the edit form shows a tone's prompt line, and saving sends what was typed", async () => {
    const promptLine = await openEditForm();
    expect(promptLine).toHaveValue("Kind and unhurried, like a friend asking.");
    expect(screen.getByText("The one line the AI reads about this tone. Leave blank to use the description.")).toBeInTheDocument();
    expect(screen.queryByText("Prompt line")).toBeNull();

    fireEvent.change(promptLine, { target: { value: "Gentle, never gushing." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateTone).toHaveBeenCalledTimes(1));
    expect(updateTone).toHaveBeenCalledWith(expect.objectContaining({ _id: "tone-1", brief: "Gentle, never gushing." }));
  });

  it("emptying the field sends it blank, which is what clears it", async () => {
    const promptLine = await openEditForm();

    fireEvent.change(promptLine, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateTone).toHaveBeenCalledTimes(1));
    expect(updateTone).toHaveBeenCalledWith(expect.objectContaining({ _id: "tone-1", brief: "" }));
  });

  it("creating a tone sends the prompt line typed in the form", async () => {
    render(<TonesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Tone" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. funny"), { target: { value: "dry" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Funny & Silly"), { target: { value: "Dry" } });
    fireEvent.change(screen.getByLabelText("Prompt Line (Optional)"), { target: { value: "Deadpan, said with a straight face." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Tone" }));

    await waitFor(() => expect(createTone).toHaveBeenCalledTimes(1));
    expect(createTone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dry", name: "Dry", brief: "Deadpan, said with a straight face." }),
    );
  });

  it("both forms say AI Guidance isn't what the AI reads when it writes questions", async () => {
    const { unmount } = render(<TonesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Tone" }));
    const createDialog = await screen.findByRole("dialog");
    const createNotes = within(createDialog).getAllByText(NOT_SENT);
    expect(createNotes).toHaveLength(1);
    expect(within(createNotes[0].parentElement!).getByText("AI Guidance")).toBeInTheDocument();
    // What the field is still for is in the note, which stays, and not in a placeholder, which goes once the box is typed in.
    expect(createNotes[0].parentElement!.querySelector("textarea")).not.toHaveAttribute("placeholder");
    expect(within(createDialog).queryByPlaceholderText("Used for matching, not for writing questions.")).toBeNull();
    expect(within(createDialog).queryByPlaceholderText(/instructions for the LLM/i)).toBeNull();
    unmount();

    await openEditForm();
    const note = within(screen.getByRole("dialog")).getByText(NOT_SENT);
    expect(within(note.parentElement!).getByText("AI Guidance")).toBeInTheDocument();
    expect(note.parentElement!.querySelector("textarea")).not.toHaveAttribute("placeholder");
  });

  // Value: protects=after a tone is created, the message says it was saved as a draft the AI won't use until it is activated;
  // fails_when=the message goes back to "created successfully", or says nothing about activating;
  // why_new=the test of creating a tone checks what is sent and never reads the message that follows;
  // seam=none; no_claim=that the server saves a new tone as a draft (the mutation is mocked; createTone in convex/admin/tones.ts sets the status).
  it("creating a tone says it was saved as a draft that still has to be activated", async () => {
    render(<TonesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Tone" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. funny"), { target: { value: "dry" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Funny & Silly"), { target: { value: "Dry" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Tone" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tone created as a draft. Activate it for the AI to use it."));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saving an edit of a live tone says it was saved as a draft that still has to be activated", async () => {
    await openEditForm();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(DRAFT_SAVED));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("saving an edit of a draft says the tone was updated, with nothing about a new version", async () => {
    vi.mocked(useQuery).mockReturnValue([warm, { ...warm, _id: "tone-1-draft", version: 3, status: "draft" }]);
    await openEditForm("draft v3");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tone updated"));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateTone).toHaveBeenCalledWith(expect.objectContaining({ _id: "tone-1-draft" }));
  });

  // Value: protects=on the tones list, the draft the save message tells the admin to activate has a button named Activate Version that activates that draft, and the live row has none;
  // fails_when=the icon button loses its name, shows on the live row, or activates a row other than the one it sits on;
  // why_new=no test of this page finds or presses the activate button, and only the styles page's tests do on theirs;
  // seam=none; no_claim=what activating does on the server (the mutation is mocked, and convex/admin_taxonomy_versions.test.ts covers it), or the grid view's menu.
  it("the draft row has an Activate Version button that activates that draft, and the live row has none", async () => {
    const activateToneVersion = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((name: string) => (name === "activateToneVersion" ? activateToneVersion : vi.fn())) as never);
    vi.mocked(useQuery).mockReturnValue([warm, { ...warm, _id: "tone-1-draft", version: 3, status: "draft" }]);
    render(<TonesPage />);
    const liveRow = screen.getByText("active v2").closest("tr")!;
    const draftRow = screen.getByText("draft v3").closest("tr")!;

    expect(within(liveRow).queryByRole("button", { name: "Activate Version" })).toBeNull();
    const activate = within(draftRow).getByRole("button", { name: "Activate Version" });
    // The name shows on hover too, since the button is only a check mark.
    expect(activate).toHaveAttribute("title", "Activate Version");
    fireEvent.click(activate);

    await waitFor(() => expect(activateToneVersion).toHaveBeenCalledTimes(1));
    expect(activateToneVersion).toHaveBeenCalledWith({ id: "tone-1-draft" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tone version activated"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
