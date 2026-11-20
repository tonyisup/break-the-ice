import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnchorHeader } from "./AnchorHeader";
import type { Id } from "../../../convex/_generated/dataModel";

const style = {
  _id: "style1",
  name: "Story driven",
  description: "Questions that invite a short story.",
  icon: "CircleHelp",
  color: "#667eea",
};

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => (args === "skip" ? undefined : style),
}));

beforeEach(() => {
  // The popover measures its anchor; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderBar(onRemoveStyle = vi.fn()) {
  render(
    <AnchorHeader
      styleId={"style1" as Id<"styles">}
      onRemoveStyle={onRemoveStyle}
      onRemoveTone={vi.fn()}
      onRemoveTopic={vi.fn()}
    />,
  );
  return onRemoveStyle;
}

it("drops the anchor's details down from its chip", () => {
  renderBar();
  expect(screen.queryByText(style.description)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Style: Story driven" }));

  expect(screen.getByRole("dialog")).toHaveTextContent(style.description);
});

it("removes the anchor from the popover", () => {
  const onRemoveStyle = renderBar();
  fireEvent.click(screen.getByRole("button", { name: "Style: Story driven" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove anchor" }));
  expect(onRemoveStyle).toHaveBeenCalledOnce();
});

it("removes the anchor straight from the chip's X", () => {
  const onRemoveStyle = renderBar();
  fireEvent.click(screen.getByRole("button", { name: "Remove Story driven anchor" }));
  expect(onRemoveStyle).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
