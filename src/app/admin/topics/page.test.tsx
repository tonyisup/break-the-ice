import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import TopicsPage from "./page";

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
      topics: {
        listTopics: "listTopics",
        createTopic: "createTopic",
        updateTopic: "updateTopic",
        deleteTopic: "deleteTopic",
        activateTopicVersion: "activateTopicVersion",
      },
    },
  },
}));

const weekends = {
  _id: "topic-1",
  _creationTime: 1,
  id: "weekends",
  slug: "weekends",
  name: "Weekends",
  description: "Days off and what people do with them.",
  promptGuidanceForAI: "Keep it about free time",
  order: 1,
  version: 2,
  status: "active",
  brief: "Days off: plans, habits and small pleasures.",
};

const NOT_SENT = "Not sent to the AI when it writes questions; the Prompt Line is. Still used to match questions to people.";
const DRAFT_SAVED = "Saved as a new draft version. Activate it for the AI to use it.";

describe("admin topics: the prompt line", () => {
  const createTopic = vi.fn();
  const updateTopic = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createTopic.mockResolvedValue("topic-2");
    updateTopic.mockResolvedValue(null);
    vi.mocked(useQuery).mockReturnValue([weekends]);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "createTopic" ? createTopic : name === "updateTopic" ? updateTopic : vi.fn()) as never);
  });

  async function openEditForm(statusLine = "active v2") {
    render(<TopicsPage />);
    const row = screen.getByText(statusLine).closest("tr")!;
    expect(within(row).getByText("Weekends")).toBeInTheDocument();
    fireEvent.click(row.querySelector(".lucide-pencil")!.closest("button")!);
    return await screen.findByLabelText("Prompt Line (Optional)");
  }

  it("the edit form shows a topic's prompt line, and saving sends what was typed", async () => {
    const promptLine = await openEditForm();
    expect(promptLine).toHaveValue("Days off: plans, habits and small pleasures.");
    expect(screen.getByText("The one line the AI reads about this topic. Leave blank to use the description.")).toBeInTheDocument();
    expect(screen.queryByText("Prompt line")).toBeNull();

    fireEvent.change(promptLine, { target: { value: "What people do with a free day." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateTopic).toHaveBeenCalledTimes(1));
    expect(updateTopic).toHaveBeenCalledWith(expect.objectContaining({ _id: "topic-1", brief: "What people do with a free day." }));
  });

  it("emptying the field sends it blank, which is what clears it", async () => {
    const promptLine = await openEditForm();

    fireEvent.change(promptLine, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateTopic).toHaveBeenCalledTimes(1));
    expect(updateTopic).toHaveBeenCalledWith(expect.objectContaining({ _id: "topic-1", brief: "" }));
  });

  it("creating a topic sends the prompt line typed in the form", async () => {
    render(<TopicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Topic" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. holidays"), { target: { value: "commutes" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Holiday Season"), { target: { value: "Commutes" } });
    fireEvent.change(screen.getByLabelText("Prompt Line (Optional)"), { target: { value: "Getting to work and back." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Topic" }));

    await waitFor(() => expect(createTopic).toHaveBeenCalledTimes(1));
    expect(createTopic).toHaveBeenCalledWith(
      expect.objectContaining({ id: "commutes", name: "Commutes", brief: "Getting to work and back." }),
    );
  });

  it("both forms say AI Guidance isn't what the AI reads when it writes questions", async () => {
    const { unmount } = render(<TopicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Topic" }));
    const createDialog = await screen.findByRole("dialog");
    const createNotes = within(createDialog).getAllByText(NOT_SENT);
    expect(createNotes).toHaveLength(1);
    expect(within(createNotes[0].parentElement!).getByText("AI Guidance")).toBeInTheDocument();
    // What the field is still for is in the note, which stays, and not in a placeholder, which goes once the box is typed in.
    expect(createNotes[0].parentElement!.querySelector("textarea")).not.toHaveAttribute("placeholder");
    expect(within(createDialog).queryByPlaceholderText("Used for matching, not for writing questions.")).toBeNull();
    expect(within(createDialog).queryByPlaceholderText(/for the AI when generating/i)).toBeNull();
    unmount();

    await openEditForm();
    const note = within(screen.getByRole("dialog")).getByText(NOT_SENT);
    expect(within(note.parentElement!).getByText("AI Guidance")).toBeInTheDocument();
    expect(note.parentElement!.querySelector("textarea")).not.toHaveAttribute("placeholder");
  });

  // Value: protects=after a topic is created, the message says it was saved as a draft the AI won't use until it is activated;
  // fails_when=the message goes back to "created successfully", or says nothing about activating;
  // why_new=the test of creating a topic checks what is sent and never reads the message that follows;
  // seam=none; no_claim=that the server saves a new topic as a draft (the mutation is mocked; createTopic in convex/admin/topics.ts sets the status).
  it("creating a topic says it was saved as a draft that still has to be activated", async () => {
    render(<TopicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Topic" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. holidays"), { target: { value: "commutes" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Holiday Season"), { target: { value: "Commutes" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Topic" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Topic created as a draft. Activate it for the AI to use it."));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saving an edit of a live topic says it was saved as a draft that still has to be activated", async () => {
    await openEditForm();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(DRAFT_SAVED));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("saving an edit of a draft says the topic was updated, with nothing about a new version", async () => {
    vi.mocked(useQuery).mockReturnValue([weekends, { ...weekends, _id: "topic-1-draft", version: 3, status: "draft" }]);
    await openEditForm("draft v3");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Topic updated"));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateTopic).toHaveBeenCalledWith(expect.objectContaining({ _id: "topic-1-draft" }));
  });

  // Value: protects=on the topics list, the draft the save message tells the admin to activate has a button named Activate Version that activates that draft, and the live row has none;
  // fails_when=the icon button loses its name, shows on the live row, or activates a row other than the one it sits on;
  // why_new=no test of this page finds or presses the activate button; the tones and styles pages each have one;
  // seam=none; no_claim=what activating does on the server (the mutation is mocked, and convex/admin_taxonomy_versions.test.ts covers it).
  it("the draft row has an Activate Version button that activates that draft, and the live row has none", async () => {
    const activateTopicVersion = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((name: string) => (name === "activateTopicVersion" ? activateTopicVersion : vi.fn())) as never);
    vi.mocked(useQuery).mockReturnValue([weekends, { ...weekends, _id: "topic-1-draft", version: 3, status: "draft" }]);
    render(<TopicsPage />);
    const liveRow = screen.getByText("active v2").closest("tr")!;
    const draftRow = screen.getByText("draft v3").closest("tr")!;

    expect(within(liveRow).queryByRole("button", { name: "Activate Version" })).toBeNull();
    fireEvent.click(within(draftRow).getByRole("button", { name: "Activate Version" }));

    await waitFor(() => expect(activateTopicVersion).toHaveBeenCalledTimes(1));
    expect(activateTopicVersion).toHaveBeenCalledWith({ _id: "topic-1-draft" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Topic version activated"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
