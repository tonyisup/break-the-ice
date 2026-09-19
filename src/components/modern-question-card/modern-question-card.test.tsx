import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModernQuestionCard } from "./modern-question-card";
import type { Doc } from "../../../convex/_generated/dataModel";
const mocks = vi.hoisted(() => ({
  drawer: vi.fn(),
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
vi.mock("../item-detail-drawer/item-detail-drawer", () => ({
  ItemDetailDrawer: (props: unknown) => {
    mocks.drawer(props);
    return null;
  },
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
function renderCard() {
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
    />,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
it("exposes named style and tone buttons that open their details", () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Style: Story driven" }));
  expect(mocks.drawer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      isOpen: true,
      item: expect.objectContaining({ type: "Style", name: "Story driven" }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Tone: Lighthearted" }));
  expect(mocks.drawer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      isOpen: true,
      item: expect.objectContaining({ type: "Tone" }),
    }),
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
