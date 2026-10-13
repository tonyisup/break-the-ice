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

const NOT_SENT = "Not sent to the AI when it writes questions. The Prompt Line is what it reads.";
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
    expect(within(createDialog).getAllByText(NOT_SENT)).toHaveLength(1);
    expect(within(createDialog).getByPlaceholderText("Used for matching, not for writing questions.")).toBeInTheDocument();
    expect(within(createDialog).queryByPlaceholderText(/for the AI when generating/i)).toBeNull();
    unmount();

    await openEditForm();
    const note = within(screen.getByRole("dialog")).getByText(NOT_SENT);
    expect(within(note.parentElement!).getByText("AI Guidance")).toBeInTheDocument();
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
});
