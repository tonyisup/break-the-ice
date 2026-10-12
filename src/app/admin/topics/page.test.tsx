import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
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

  async function openEditForm() {
    render(<TopicsPage />);
    const row = screen.getByText("Weekends").closest("tr")!;
    fireEvent.click(row.querySelector(".lucide-pencil")!.closest("button")!);
    return await screen.findByLabelText("Prompt line");
  }

  it("the edit form shows a topic's prompt line, and saving sends what was typed", async () => {
    const promptLine = await openEditForm();
    expect(promptLine).toHaveValue("Days off: plans, habits and small pleasures.");
    expect(screen.getByText("The one line the AI reads about this topic. Leave blank to use the description.")).toBeInTheDocument();

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
    fireEvent.change(screen.getByLabelText("Prompt line"), { target: { value: "Getting to work and back." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Topic" }));

    await waitFor(() => expect(createTopic).toHaveBeenCalledTimes(1));
    expect(createTopic).toHaveBeenCalledWith(
      expect.objectContaining({ id: "commutes", name: "Commutes", brief: "Getting to work and back." }),
    );
  });
});
