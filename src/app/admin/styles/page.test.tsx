import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
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

describe("admin styles: the prompt line and the set form", () => {
  const createStyle = vi.fn();
  const updateStyle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createStyle.mockResolvedValue("style-2");
    updateStyle.mockResolvedValue(null);
    vi.mocked(useQuery).mockReturnValue([eitherOr]);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "createStyle" ? createStyle : name === "updateStyle" ? updateStyle : vi.fn()) as never);
  });

  async function openEditForm() {
    render(<StylesPage />);
    const row = screen.getByText("Either/Or").closest("tr")!;
    fireEvent.click(row.querySelector(".lucide-pencil")!.closest("button")!);
    return await screen.findByLabelText("Prompt line");
  }

  it("the edit form shows a style's prompt line and set form, and saving sends what was typed", async () => {
    const promptLine = await openEditForm();
    const setForm = screen.getByLabelText("Set form (optional)");
    expect(promptLine).toHaveValue("Two everyday things, and the person picks one.");
    expect(setForm).toHaveValue("Two options, no lead-in.");
    expect(screen.getByText("The one line the AI reads about this style. Leave blank to use the description.")).toBeInTheDocument();
    expect(screen.getByText("Only for a style whose form is the style, like either/or. Every question keeps it.")).toBeInTheDocument();

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
    fireEvent.change(screen.getByLabelText("Set form (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateStyle).toHaveBeenCalledTimes(1));
    expect(updateStyle).toHaveBeenCalledWith(expect.objectContaining({ _id: "style-1", brief: "", form: "" }));
  });

  it("creating a style sends the prompt line and the set form typed in the form", async () => {
    render(<StylesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Style" }));

    fireEvent.change(await screen.findByPlaceholderText("e.g. open-ended"), { target: { value: "one-word" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Open Ended"), { target: { value: "One Word" } });
    fireEvent.change(screen.getByLabelText("Prompt line"), { target: { value: "A question answered in a single word." } });
    fireEvent.change(screen.getByLabelText("Set form (optional)"), { target: { value: "The answer is one word." } });
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
});
