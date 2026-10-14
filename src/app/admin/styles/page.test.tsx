import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
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

/** A second edit of the live style, saved while the first draft was still waiting. */
const eitherOrSecondDraft = {
  ...eitherOr,
  _id: "style-1-draft-2",
  _creationTime: 4,
  version: 4,
  status: "draft",
  brief: "This or that, quick.",
  form: "Two options joined by or.",
};

/** A version of a third style that was archived with nothing put in its place. */
const oneWordArchived = {
  ...eitherOr,
  _id: "style-2",
  _creationTime: 3,
  id: "one-word",
  slug: "one-word",
  name: "One Word",
  order: 2,
  version: 1,
  status: "archived",
};

const NOT_SENT = "Not sent to the AI when it writes questions; the Prompt Line is. Still used to match questions to people.";
const SET_FORM_HELP =
  "Fill in only if every question in this style must follow one pattern. Describe the pattern. The AI keeps it in every question, and questions in this style may then be as short as three words.";
// The status badge of the live row above, of its two drafts, and of the archived version.
const LIVE = "Live v2";
const DRAFT = "Draft v3, not live";
const SECOND_DRAFT = "Draft v4, not live";
const ARCHIVED = "Archived v1, not live";
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

  /** The table row of one version of a style, found by the status badge under its name. */
  const rowOf = (statusBadge: string) => screen.getByText(statusBadge).closest("tr")!;

  async function openEditForm(statusBadge = LIVE) {
    render(<StylesPage />);
    const row = rowOf(statusBadge);
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

  // Value: protects=after a style is created, the message says it was saved as a draft the AI won't use until it is activated;
  // fails_when=the message goes back to "created successfully", or says nothing about activating;
  // why_new=the test above checks what creating sends and never reads the message that follows;
  // seam=none; no_claim=that the server saves a new style as a draft (the mutation is mocked; createStyle in convex/admin/styles.ts sets the status).
  it("creating a style says it was saved as a draft that still has to be activated", async () => {
    render(<StylesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Style" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. open-ended"), { target: { value: "one-word" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Open Ended"), { target: { value: "One Word" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Style" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Style created as a draft. Activate it for the AI to use it."));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the create form says the older fields aren't what the AI reads, and what a set form is for", async () => {
    render(<StylesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Style" }));
    const dialog = await screen.findByRole("dialog");

    // One note under Structural Instruction and one under AI Guidance.
    const notes = within(dialog).getAllByText(NOT_SENT);
    expect(notes).toHaveLength(2);
    expect(within(notes[0].parentElement!).getByText("Structural Instruction")).toBeInTheDocument();
    expect(within(notes[1].parentElement!).getByText("AI Guidance")).toBeInTheDocument();
    // What the field is still for is in the note, which stays, and not in a placeholder, which goes once the box is typed in.
    for (const note of notes) {
      expect(note.parentElement!.querySelector("textarea")).not.toHaveAttribute("placeholder");
    }
    expect(within(dialog).queryByPlaceholderText("Used for matching, not for writing questions.")).toBeNull();
    expect(within(dialog).queryByPlaceholderText(/Start with/)).toBeNull();
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
    for (const note of notes) {
      expect(note.parentElement!.querySelector("textarea")).not.toHaveAttribute("placeholder");
    }
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
    const promptLine = await openEditForm(DRAFT);

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
    const liveRow = screen.getByText(LIVE).closest("tr")!;
    const draftRow = screen.getByText(DRAFT).closest("tr")!;
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
    const liveCard = cardOf(LIVE);
    const draftCard = cardOf(DRAFT);
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
    const editButton = (statusBadge: string) =>
      screen.getByText(statusBadge).closest("tr")!.querySelector(".lucide-pencil")!.closest("button")!;

    fireEvent.click(editButton(DRAFT));
    expect(await screen.findByLabelText("Prompt Line (Optional)")).toHaveValue("Two small things, pick one.");
    expect(screen.getByLabelText("Set Form (Optional)")).toHaveValue("Two options and nothing else.");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateStyle).toHaveBeenCalledTimes(1));
    expect(updateStyle).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "style-1-draft", brief: "Two small things, pick one.", form: "Two options and nothing else." }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(editButton(LIVE));
    expect(await screen.findByLabelText("Prompt Line (Optional)")).toHaveValue("Two everyday things, and the person picks one.");
    expect(screen.getByLabelText("Set Form (Optional)")).toHaveValue("Two options, no lead-in.");
  });

  // Value: protects=when a style has two drafts waiting, the list and the grid show its live version and both drafts, each draft with its own badge and its own Activate Version, and Edit on a draft opens that draft's values;
  // fails_when=a second draft is dropped or takes the first one's place, both drafts carry one badge, or Activate Version or Edit on one draft acts on the other;
  // why_new=every test above lists at most one draft of a style, and the server lists every draft newer than the live version;
  // seam=none; no_claim=which drafts the server lists or in what order (the list is mocked, and convex/admin_taxonomy_versions.test.ts covers it).
  it("with two drafts of one style, shows each with its own badge, activates the one pressed, and opens the one edited", async () => {
    vi.mocked(useQuery).mockReturnValue([eitherOr, eitherOrDraft, eitherOrSecondDraft]);
    render(<StylesPage />);
    const rowOf = (statusBadge: string) => screen.getByText(statusBadge).closest("tr")!;

    // The list keeps the order it is given: the live version, then its drafts.
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    [LIVE, DRAFT, SECOND_DRAFT].forEach((statusBadge, i) => expect(rows[i]).toBe(rowOf(statusBadge)));
    for (const row of rows) expect(within(row).getByText("Either/Or")).toBeInTheDocument();
    expect(within(rowOf(LIVE)).queryByRole("button", { name: "Activate Version" })).toBeNull();

    fireEvent.click(within(rowOf(SECOND_DRAFT)).getByRole("button", { name: "Activate Version" }));
    await waitFor(() => expect(activateStyleVersion).toHaveBeenCalledTimes(1));
    expect(activateStyleVersion).toHaveBeenLastCalledWith({ id: "style-1-draft-2" });
    fireEvent.click(within(rowOf(DRAFT)).getByRole("button", { name: "Activate Version" }));
    await waitFor(() => expect(activateStyleVersion).toHaveBeenCalledTimes(2));
    expect(activateStyleVersion).toHaveBeenLastCalledWith({ id: "style-1-draft" });

    // Edit on a draft opens that draft, and the line under the title names it.
    const edit = (statusBadge: string) => fireEvent.click(rowOf(statusBadge).querySelector(".lucide-pencil")!.closest("button")!);
    edit(SECOND_DRAFT);
    expect(await screen.findByLabelText("Prompt Line (Optional)")).toHaveValue("This or that, quick.");
    expect(screen.getByLabelText("Set Form (Optional)")).toHaveValue("Two options joined by or.");
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Draft v4. Saving changes this draft; activate it for the AI to use it.");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateStyle).toHaveBeenCalledTimes(1));
    expect(updateStyle).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "style-1-draft-2", brief: "This or that, quick.", form: "Two options joined by or." }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    edit(DRAFT);
    expect(await screen.findByLabelText("Prompt Line (Optional)")).toHaveValue("Two small things, pick one.");
    expect(screen.getByLabelText("Set Form (Optional)")).toHaveValue("Two options and nothing else.");
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Draft v3. Saving changes this draft; activate it for the AI to use it.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateStyle).toHaveBeenCalledTimes(1);

    // The grid shows the same three, and each draft's own menu activates that draft.
    fireEvent.click(document.querySelector(".lucide-layout-grid")!.closest("button")!);
    expect(screen.getAllByRole("heading", { name: "Either/Or" })).toHaveLength(3);
    const cardOf = (statusBadge: string) => screen.getByText(statusBadge).closest("div.group") as HTMLElement;
    expect(new Set([cardOf(LIVE), cardOf(DRAFT), cardOf(SECOND_DRAFT)]).size).toBe(3);
    const activateFromMenu = async (card: HTMLElement) => {
      fireEvent.keyDown(card.querySelector(".lucide-ellipsis")!.closest("button")!, { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Activate Version" }));
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    };

    await activateFromMenu(cardOf(DRAFT));
    await waitFor(() => expect(activateStyleVersion).toHaveBeenCalledTimes(3));
    expect(activateStyleVersion).toHaveBeenLastCalledWith({ id: "style-1-draft" });
    await activateFromMenu(cardOf(SECOND_DRAFT));
    await waitFor(() => expect(activateStyleVersion).toHaveBeenCalledTimes(4));
    expect(activateStyleVersion).toHaveBeenLastCalledWith({ id: "style-1-draft-2" });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("admin styles: which version a row is, and what saving it does", () => {
  const updateStyle = vi.fn();
  // Not a message the server has: any refusal that carries its own words is shown this way.
  const SERVER_REASON = "This style can't be saved while its questions are being moved. Try again in a minute.";

  beforeEach(() => {
    vi.clearAllMocks();
    updateStyle.mockResolvedValue(null);
    vi.mocked(useQuery).mockReturnValue([eitherOr, eitherOrDraft, oneWordArchived]);
    vi.mocked(useMutation).mockImplementation(((name: string) => (name === "updateStyle" ? updateStyle : vi.fn())) as never);
  });

  const editButton = (statusBadge: string) =>
    screen.getByText(statusBadge).closest("tr")!.querySelector(".lucide-pencil")!.closest("button")!;

  // Value: protects=every row of the styles list and every card of the grid says in a badge whether that version is live, as "Live v2", "Draft v3, not live" or "Archived v1, not live", in the same words in both views;
  // fails_when=the list goes back to a small grey "draft v3" line, a version that isn't live loses "not live", or the two views word a status differently;
  // why_new=the tests above find a row by its status text and never check how a draft or an archived version is told from the live one, and none lists an archived version;
  // seam=none; no_claim=how a badge looks on screen (the test reads its words, and that a live badge and a draft one are not styled alike), or which versions the server lists.
  it("marks each row of the list and each card of the grid with a badge that says whether that version is live", () => {
    render(<StylesPage />);
    const badges = () => [LIVE, DRAFT, ARCHIVED].map((words) => screen.getByText(words));

    // The list is the view the page opens in.
    const [liveInList, draftInList, archivedInList] = badges();
    expect(within(liveInList.closest("tr")!).getByText("Either/Or")).toBeInTheDocument();
    expect(within(draftInList.closest("tr")!).getByText("Either/Or")).toBeInTheDocument();
    expect(within(archivedInList.closest("tr")!).getByText("One Word")).toBeInTheDocument();
    expect(liveInList.closest("tr")).not.toBe(draftInList.closest("tr"));
    // A draft is no longer told apart only by a small grey line.
    for (const old of ["active v2", "draft v3", "archived v1"]) expect(screen.queryByText(old)).toBeNull();
    expect(draftInList).not.toHaveClass("text-muted-foreground");
    expect(draftInList.className).not.toBe(liveInList.className);
    expect(archivedInList.className).toBe(draftInList.className);

    fireEvent.click(document.querySelector(".lucide-layout-grid")!.closest("button")!);

    const [liveInGrid, draftInGrid, archivedInGrid] = badges();
    expect(within(liveInGrid.closest("div.group") as HTMLElement).getByRole("heading", { name: "Either/Or" })).toBeInTheDocument();
    expect(within(draftInGrid.closest("div.group") as HTMLElement).getByRole("heading", { name: "Either/Or" })).toBeInTheDocument();
    expect(within(archivedInGrid.closest("div.group") as HTMLElement).getByRole("heading", { name: "One Word" })).toBeInTheDocument();
    for (const old of ["active v2", "draft v3", "archived v1"]) expect(screen.queryByText(old)).toBeNull();
    expect(draftInGrid.className).not.toBe(liveInGrid.className);
    expect(archivedInGrid.className).toBe(draftInGrid.className);
  });

  // Value: protects=a style whose row was saved before versions had a status reads as live on its badge, as the server treats it;
  // fails_when=such a row shows no status word, or is marked "not live";
  // why_new=the one test with a row like this only reads the message after a save, not the row's badge;
  // seam=none; no_claim=that the server still returns rows without a status (its list fills one in).
  it("marks a style saved before versions had a status as live", () => {
    const { status: _status, ...noStatus } = eitherOr;
    vi.mocked(useQuery).mockReturnValue([noStatus]);
    render(<StylesPage />);

    expect(within(screen.getByText(LIVE).closest("tr")!).getByText("Either/Or")).toBeInTheDocument();
    expect(screen.queryByText(/not live/)).toBeNull();
  });

  // Value: protects=under the edit dialog's title, a line says which version is open and what Save does to it: a draft is changed in place, any other version is saved as a new draft to activate;
  // fails_when=the line is missing, names the wrong version or status, or tells the admin a live row's save takes effect at once;
  // why_new=both rows of a style open a dialog with the same title, and the tests above tell them apart only by the values in the fields;
  // seam=none; no_claim=what the server does with the save (the mutation is mocked, and convex/admin_taxonomy_versions.test.ts covers it).
  it.each([
    ["the live row", LIVE, "Live v2. Saving makes a new draft version, which you then activate."],
    ["the draft row", DRAFT, "Draft v3. Saving changes this draft; activate it for the AI to use it."],
    ["an archived row", ARCHIVED, "Archived v1. Saving makes a new draft version, which you then activate."],
  ])("the edit dialog of %s says which version is open and what saving does", async (_which, statusBadge, line) => {
    render(<StylesPage />);
    fireEvent.click(editButton(statusBadge));
    const dialog = await screen.findByRole("dialog");

    // The line is the dialog's description, so it sits under the title and is read out with it.
    expect(dialog).toHaveAccessibleDescription(line);
    expect(within(dialog).getByText(line)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Saving (makes|changes)/)).toHaveLength(1);
  });

  // Value: protects=when the server refuses a save and says why, the admin reads the server's words, and the dialog stays open with what was typed;
  // fails_when=the refusal shows as the page's generic "Failed to update style", shows as a success, or closes the dialog and loses the edit;
  // why_new=no test of this page makes a save fail;
  // seam=none; no_claim=that the server refuses any save with words of its own today (the message here is made up, and the mutation is mocked to refuse).
  it("shows the server's own words when a save is refused with a reason, and keeps the edit open", async () => {
    updateStyle.mockRejectedValue(new ConvexError({ code: "STYLE_SAVE_REFUSED", message: SERVER_REASON }));
    render(<StylesPage />);
    fireEvent.click(editButton(LIVE));
    const promptLine = await screen.findByLabelText("Prompt Line (Optional)");

    fireEvent.change(promptLine, { target: { value: "Two things, choose." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(SERVER_REASON));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(updateStyle).toHaveBeenCalledWith(expect.objectContaining({ _id: "style-1", brief: "Two things, choose." }));
    expect(screen.getByLabelText("Prompt Line (Optional)")).toHaveValue("Two things, choose.");
  });

  // Value: protects=a save that fails with no reason the admin can read shows the page's own plain message, not the raw error;
  // fails_when=a server error's raw text, with its request id, reaches the toast, or nothing is shown;
  // why_new=no test of this page makes a save fail;
  // seam=none; no_claim=what Convex puts in a failed call's message in production (the two errors here stand in for it).
  it.each([
    ["an error with no readable message", new Error("[CONVEX M(admin/styles:updateStyle)] [Request ID: abc123] Server Error")],
    ["a refusal that carries no message", new ConvexError({ code: "SOMETHING_ELSE" })],
  ])("falls back to a plain message when a save fails with %s", async (_what, failure) => {
    updateStyle.mockRejectedValue(failure);
    render(<StylesPage />);
    fireEvent.click(editButton(LIVE));
    await screen.findByLabelText("Prompt Line (Optional)");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update style"));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
