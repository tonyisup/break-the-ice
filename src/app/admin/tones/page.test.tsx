import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
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

  async function openEditForm() {
    render(<TonesPage />);
    const row = screen.getByText("Warm").closest("tr")!;
    fireEvent.click(row.querySelector(".lucide-pencil")!.closest("button")!);
    return await screen.findByLabelText("Prompt line");
  }

  it("the edit form shows a tone's prompt line, and saving sends what was typed", async () => {
    const promptLine = await openEditForm();
    expect(promptLine).toHaveValue("Kind and unhurried, like a friend asking.");
    expect(screen.getByText("The one line the AI reads about this tone. Leave blank to use the description.")).toBeInTheDocument();

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
    fireEvent.change(screen.getByLabelText("Prompt line"), { target: { value: "Deadpan, said with a straight face." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Tone" }));

    await waitFor(() => expect(createTone).toHaveBeenCalledTimes(1));
    expect(createTone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dry", name: "Dry", brief: "Deadpan, said with a straight face." }),
    );
  });
});
