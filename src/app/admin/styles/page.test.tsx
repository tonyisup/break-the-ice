import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import StylesPage from "./page";

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
      styles: {
        listStyles: "listStyles",
        createStyle: "createStyle",
        updateStyle: "updateStyle",
        archiveStyle: "archiveStyle",
        activateStyleVersion: "activateStyleVersion",
      },
    },
  },
}));

const eitherOr = {
  _id: "style-1",
  _creationTime: 1,
  id: "either-or",
  slug: "either-or",
  name: "Either/Or",
  description: "Two options to choose between.",
  structure: "Offer two options",
  color: "#111111",
  icon: "Sparkles",
  promptGuidanceForAI: "Keep it short",
  order: 1,
  version: 2,
  status: "active",
  brief: "Two everyday things, and the person picks one.",
  form: "Two options, no lead-in.",
};

/** An edit of the live style above, saved as the next version and not yet activated. */
const eitherOrDraft = {
  ...eitherOr,
  _id: "style-1-draft",
  _creationTime: 2,
  version: 3,
  status: "draft",
  brief: "Two small things, pick one.",
  form: "Two options and nothing else.",
};

const NOT_SENT = "Not sent to the AI when it writes questions. The Prompt Line is what it reads.";
const SET_FORM_HELP =
  "Fill in only if every question in this style must follow one pattern. Describe the pattern. The AI keeps it in every question.";
const SET_FORM_EXAMPLE = "Begins 'Would you rather' and offers two options.";
const DRAFT_SAVED = "Saved as a new draft version. Activate it for the AI to use it.";

describe("admin styles: the prompt line and the set form", () => {
  const createStyle = vi.fn();
  const updateStyle = vi.fn();
  const activateStyleVersion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createStyle.mockResolvedValue("style-2");
    updateStyle.mockResolvedValue(null);
    activateStyleVersion.mockResolvedValue(null);
    vi.mocked(useQuery).mockReturnValue([eitherOr]);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "createStyle"
        ? createStyle
        : name === "updateStyle"
          ? updateStyle
          : name === "activateStyleVersion"
            ? activateStyleVersion
            : vi.fn()) as never);
  });

  /** The table row of one version of a style, found by the status line under its name. */
  const rowOf = (statusLine: string) => screen.getByText(statusLine).closest("tr")!;

  async function openEditForm(statusLine = "active v2") {
    render(<StylesPage />);
    const row = rowOf(statusLine);
    expect(within(row).getByText("Either/Or")).toBeInTheDocument();
    fireEvent.click(row.querySelector(".lucide-pencil")!.closest("button")!);
    return await screen.findByLabelText("Prompt Line (Optional)");
  }

  it("the edit form shows a style's prompt line and set form, and saving sends what was typed", async () => {
    const promptLine = await openEditForm();
    const setForm = screen.getByLabelText("Set Form (Optional)");
    expect(promptLine).toHaveValue("Two everyday things, and the person picks one.");
    expect(setForm).toHaveValue("Two options, no lead-in.");
    expect(screen.getByText("The one line the AI reads about this style. Leave blank to use the description.")).toBeInTheDocument();
    expect(screen.getByText(SET_FORM_HELP)).toBeInTheDocument();
    expect(setForm).toHaveAttribute("placeholder", SET_FORM_EXAMPLE);
    // The labels the owner knew are gone, so nothing shows the field under two names.
    expect(screen.queryByText("Prompt line")).toBeNull();
    expect(screen.queryByText("Set form (optional)")).toBeNull();

    fireEvent.change(promptLine, { target: { value: "Two small things, pick one." } });
    fireEvent.change(setForm, { target: { value: "Two options and nothing else." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateStyle).toHaveBeenCalledTimes(1));
    expect(updateStyle).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "style-1", brief: "Two small things, pick one.", form: "Two options and nothing else." }),
    );
  });

  it("emptying both fields sends them blank, which is what clears them", async () => {
    const promptLine = await openEditForm();

    fireEvent.change(promptLine, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Set Form (Optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateStyle).toHaveBeenCalledTimes(1));
    expect(updateStyle).toHaveBeenCalledWith(expect.objectContaining({ _id: "style-1", brief: "", form: "" }));
  });

  it("creating a style sends the prompt line and the set form typed in the form", async () => {
    render(<StylesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Style" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. open-ended"), { target: { value: "one-word" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Open Ended"), { target: { value: "One Word" } });
    fireEvent.change(screen.getByLabelText("Prompt Line (Optional)"), { target: { value: "A question answered in a single word." } });
    fireEvent.change(screen.getByLabelText("Set Form (Optional)"), { target: { value: "The answer is one word." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Style" }));

    await waitFor(() => expect(createStyle).toHaveBeenCalledTimes(1));
    expect(createStyle).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "one-word",
        name: "One Word",
        brief: "A question answered in a single word.",
        form: "The answer is one word.",
      }),
    );
  });

  it("the create form says the older fields aren't what the AI reads, and what a set form is for", async () => {
    render(<StylesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Style" }));
    const dialog = await screen.findByRole("dialog");

    // One note under Structural Instruction and one under AI Guidance.
    expect(within(dialog).getAllByText(NOT_SENT)).toHaveLength(2);
    expect(within(dialog).getByPlaceholderText("Used for matching, not for writing questions.")).toBeInTheDocument();
    expect(within(dialog).queryByPlaceholderText(/instructions for the LLM/i)).toBeNull();
    expect(within(dialog).getByText(SET_FORM_HELP)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Set Form (Optional)")).toHaveAttribute("placeholder", SET_FORM_EXAMPLE);
  });

  it("the edit form says the older fields aren't what the AI reads", async () => {
    await openEditForm();
    const dialog = screen.getByRole("dialog");

    const notes = within(dialog).getAllByText(NOT_SENT);
    expect(notes).toHaveLength(2);
    // Each note sits in its field's own block, under the box it is about.
    expect(within(notes[0].parentElement!).getByText("Structural Instruction")).toBeInTheDocument();
    expect(within(notes[1].parentElement!).getByText("AI Guidance")).toBeInTheDocument();
  });

  it("saving an edit of a live style says it was saved as a draft that still has to be activated", async () => {
    const promptLine = await openEditForm();

    fireEvent.change(promptLine, { target: { value: "Two small things, pick one." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(DRAFT_SAVED));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalledWith("Style updated");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a style saved before versions had a status is live, so its edit is announced as a draft too", async () => {
    const { status: _status, ...noStatus } = eitherOr;
    vi.mocked(useQuery).mockReturnValue([noStatus]);
    render(<StylesPage />);
    fireEvent.click(screen.getByText("Either/Or").closest("tr")!.querySelector(".lucide-pencil")!.closest("button")!);
    await screen.findByLabelText("Prompt Line (Optional)");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(DRAFT_SAVED));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("saving an edit of a draft says the style was updated, with nothing about a new version", async () => {
    vi.mocked(useQuery).mockReturnValue([eitherOr, eitherOrDraft]);
    const promptLine = await openEditForm("draft v3");

    fireEvent.change(promptLine, { target: { value: "Two things, choose." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Style updated"));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalledWith(DRAFT_SAVED);
    expect(updateStyle).toHaveBeenCalledWith(expect.objectContaining({ _id: "style-1-draft", brief: "Two things, choose." }));
  });
});

describe("admin styles: a live style listed with its newer draft", () => {
  const updateStyle = vi.fn();
  const activateStyleVersion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateStyle.mockResolvedValue(null);
    activateStyleVersion.mockResolvedValue(null);
    vi.mocked(useQuery).mockReturnValue([eitherOr, eitherOrDraft]);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "updateStyle" ? updateStyle : name === "activateStyleVersion" ? activateStyleVersion : vi.fn()) as never);
  });

  it("shows both rows in the list, and only the draft can be activated", async () => {
    render(<StylesPage />);

    expect(screen.getAllByText("Either/Or")).toHaveLength(2);
    const liveRow = screen.getByText("active v2").closest("tr")!;
    const draftRow = screen.getByText("draft v3").closest("tr")!;
    expect(liveRow).not.toBe(draftRow);
    expect(within(liveRow).queryByRole("button", { name: "Activate Version" })).toBeNull();

    fireEvent.click(within(draftRow).getByRole("button", { name: "Activate Version" }));

    await waitFor(() => expect(activateStyleVersion).toHaveBeenCalledTimes(1));
    expect(activateStyleVersion).toHaveBeenCalledWith({ id: "style-1-draft" });
  });

  it("shows both cards in the grid, each with its status, and only the draft's menu offers Activate Version", async () => {
    render(<StylesPage />);
    fireEvent.click(document.querySelector(".lucide-layout-grid")!.closest("button")!);

    expect(screen.getAllByRole("heading", { name: "Either/Or" })).toHaveLength(2);
    const cardOf = (statusBadge: string) => screen.getByText(statusBadge).closest("div.group") as HTMLElement;
    const liveCard = cardOf("active v2");
    const draftCard = cardOf("draft v3");
    expect(liveCard).not.toBe(draftCard);

    const menuButton = (card: HTMLElement) => card.querySelector(".lucide-ellipsis")!.closest("button")!;
    fireEvent.keyDown(menuButton(liveCard), { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem", { name: "Edit Style" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Activate Version" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    fireEvent.keyDown(menuButton(draftCard), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Activate Version" }));

    await waitFor(() => expect(activateStyleVersion).toHaveBeenCalledTimes(1));
    expect(activateStyleVersion).toHaveBeenCalledWith({ id: "style-1-draft" });
  });

  it("Edit on the draft row opens the draft's own values, and Edit on the live row the live ones", async () => {
    render(<StylesPage />);
    const editButton = (statusLine: string) =>
      screen.getByText(statusLine).closest("tr")!.querySelector(".lucide-pencil")!.closest("button")!;

    fireEvent.click(editButton("draft v3"));
    expect(await screen.findByLabelText("Prompt Line (Optional)")).toHaveValue("Two small things, pick one.");
    expect(screen.getByLabelText("Set Form (Optional)")).toHaveValue("Two options and nothing else.");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateStyle).toHaveBeenCalledTimes(1));
    expect(updateStyle).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "style-1-draft", brief: "Two small things, pick one.", form: "Two options and nothing else." }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(editButton("active v2"));
    expect(await screen.findByLabelText("Prompt Line (Optional)")).toHaveValue("Two everyday things, and the person picks one.");
    expect(screen.getByLabelText("Set Form (Optional)")).toHaveValue("Two options, no lead-in.");
  });
});
