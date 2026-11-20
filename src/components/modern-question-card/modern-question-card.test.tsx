import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ModernQuestionCard } from "./modern-question-card";
import type { Doc } from "../../../convex/_generated/dataModel";
const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => null,
  useConvexAuth: () => ({ isAuthenticated: false }),
}));
vi.mock("@/hooks/useStorageContext", () => ({
  useStorageContext: () => ({
    likedQuestions: [],
    hiddenQuestions: [],
    likedLimit: 10,
    hiddenLimit: 10,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
const question = {
  _id: "question1",
  text: "What small thing made you smile today?",
} as Doc<"questions">;
const style = {
  _id: "style1",
  id: "story",
  name: "Story driven",
  icon: "CircleHelp",
  color: "#667eea",
} as Doc<"styles">;
const tone = {
  _id: "tone1",
  id: "light",
  name: "Lighthearted",
  icon: "CircleHelp",
  color: "#764ba2",
} as Doc<"tones">;
function renderCard(overrides: Partial<ComponentProps<typeof ModernQuestionCard>> = {}) {
  return render(
    <ModernQuestionCard
      question={question}
      style={style}
      tone={tone}
      gradient={["#667eea", "#764ba2"]}
      isGenerating={false}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
      onToggleHidden={vi.fn()}
      onHideStyle={vi.fn()}
      onHideTone={vi.fn()}
      {...overrides}
    />,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
it("flips the card to show a style's details and flips back", () => {
  renderCard();
  const styleChip = screen.getByRole("button", { name: "Style: Story driven" });
  styleChip.focus();
  fireEvent.click(styleChip);

  expect(screen.getByRole("heading", { name: "Story driven" })).toBeInTheDocument();
  const back = screen.getByRole("button", { name: "Back to question" });
  expect(back).toHaveFocus();
  expect(back.closest("[inert]")).toBeNull();
  expect(styleChip.closest("[inert]")).not.toBeNull();

  fireEvent.click(back);
  expect(back.closest("[inert]")).not.toBeNull();
  expect(styleChip).toHaveFocus();
});

it("flips back on Escape", () => {
  renderCard();
  const toneChip = screen.getByRole("button", { name: "Tone: Lighthearted" });
  fireEvent.click(toneChip);
  expect(screen.getByRole("heading", { name: "Lighthearted" })).toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole("button", { name: "Back to question" }), { key: "Escape" });
  expect(toneChip.closest("[inert]")).toBeNull();
});

it("hides the style from the back of the card and turns face-up", () => {
  const onHideStyle = vi.fn();
  renderCard({ onHideStyle });
  const styleChip = screen.getByRole("button", { name: "Style: Story driven" });
  fireEvent.click(styleChip);
  fireEvent.click(screen.getByRole("button", { name: "Hide this style" }));

  expect(onHideStyle).toHaveBeenCalledWith("style1");
  expect(styleChip.closest("[inert]")).toBeNull();
});

it("anchors the tone from the back of the card", () => {
  const onAnchorItem = vi.fn();
  renderCard({ onAnchorItem });
  fireEvent.click(screen.getByRole("button", { name: "Tone: Lighthearted" }));
  fireEvent.click(screen.getByRole("button", { name: "More like this tone" }));

  expect(onAnchorItem).toHaveBeenCalledWith(
    expect.objectContaining({ type: "Tone", name: "Lighthearted" }),
  );
});

it("copies the question URL when native sharing is unavailable", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Share question" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/question/question1`,
    ),
  );
  expect(mocks.success).toHaveBeenCalledWith("Question link copied");
});
it("does not report an error when native sharing is cancelled", async () => {
  const share = vi
    .fn()
    .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  vi.stubGlobal("navigator", { share });
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Share question" }));
  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(mocks.error).not.toHaveBeenCalled();
});
