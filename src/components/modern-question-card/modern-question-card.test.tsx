import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Doc } from "../../../convex/_generated/dataModel";
import { ModernQuestionCard } from "./modern-question-card";

vi.mock("convex/react", () => ({ useQuery: () => null, useConvexAuth: () => ({ isAuthenticated: false }) }));
vi.mock("@/hooks/useStorageContext", () => ({ useStorageContext: () => ({ likedQuestions: [], likedLimit: 100, hiddenQuestions: [], hiddenLimit: 100, storageLimitBehavior: "block" }) }));
vi.mock("../item-detail-drawer/item-detail-drawer", () => ({
  ItemDetailDrawer: ({ isOpen, item }: { isOpen: boolean; item: { name: string } | null }) => isOpen ? <div role="dialog">{item?.name}</div> : null,
}));
vi.mock("../remix-question-drawer/remix-question-drawer", () => ({ RemixQuestionDrawer: () => null }));

describe("question controls", () => {
  it("renders focusable, named taxonomy buttons and opens their details", () => {
    const style = { _id: "style-id", id: "story", slug: "story", name: "Story", icon: "Book", color: "#333" } as Doc<"styles">;
    const tone = { _id: "tone-id", id: "warm", slug: "warm", name: "Warm", icon: "Heart", color: "#444" } as Doc<"tones">;
    const question = { _id: "question-id", text: "What small tradition would you pass on?", style: "story", tone: "warm" } as Doc<"questions">;
    render(<ModernQuestionCard question={question} style={style} tone={tone} isGenerating={false} isFavorite={false}
      onToggleFavorite={vi.fn()} onToggleHidden={vi.fn()} onHideStyle={vi.fn()} onHideTone={vi.fn()} />);
    const styleButton = screen.getByRole("button", { name: "Style: Story" });
    styleButton.focus();
    expect(styleButton).toHaveFocus();
    expect(styleButton).toHaveTextContent("Story");
    fireEvent.click(styleButton);
    expect(screen.getByRole("dialog")).toHaveTextContent("Story");
    fireEvent.click(screen.getByRole("button", { name: "Tone: Warm" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Warm");
  });
});
