import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { FeedFilterBar } from "./FeedFilterBar";

const styles = [
  { _id: "style1", slug: "story-driven", name: "Story driven", description: "Questions that invite a short story.", icon: "CircleHelp", color: "#667eea" },
  { _id: "style2", slug: "would-you-rather", name: "Would you rather", icon: "CircleHelp", color: "#f59e0b" },
];
const tones = [{ _id: "tone1", slug: "playful", name: "Playful", icon: "CircleHelp", color: "#10b981" }];
const topics = [{ _id: "topic1", slug: "food", name: "Food" }];

beforeEach(() => {
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

function renderBar(props: Partial<React.ComponentProps<typeof FeedFilterBar>> = {}) {
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <FeedFilterBar styles={styles} tones={tones} topics={topics} onChange={onChange} onClearAll={vi.fn()} {...props} />
    </MemoryRouter>,
  );
  return onChange;
}

it("stays tucked behind a single Filter button before any filter is chosen", () => {
  renderBar();
  expect(screen.getByRole("button", { name: "Filter questions" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Active filters" })).not.toBeInTheDocument();
});

it("lists the choices with their descriptions inside the filter popover and reports the chosen slug", () => {
  const onChange = renderBar();
  fireEvent.click(screen.getByRole("button", { name: "Filter questions" }));
  expect(screen.getByText("Questions that invite a short story.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Would you rather/ }));
  expect(onChange).toHaveBeenCalledWith("style", "would-you-rather");
});

it("shows an active chip for a chosen filter and clears it from the X", () => {
  const onChange = renderBar({ selectedStyleId: "style1" });
  expect(screen.getByRole("button", { name: "Filter questions (1 active)" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove Story driven filter" }));
  expect(onChange).toHaveBeenCalledWith("style", null);
});

it("clears a filter from the list with the Any choice", () => {
  const onChange = renderBar({ selectedToneId: "tone1" });
  fireEvent.click(screen.getByRole("button", { name: "Filter questions (1 active)" }));
  fireEvent.click(screen.getByRole("tab", { name: "Tone" }));
  fireEvent.click(screen.getByRole("button", { name: "Any tone" }));
  expect(onChange).toHaveBeenCalledWith("tone", null);
});

it("offers Clear all once two filters are set, as one step", () => {
  const onClearAll = vi.fn();
  const onChange = renderBar({ selectedStyleId: "style1", selectedToneId: "tone1", onClearAll });
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(onClearAll).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
});

it("has no Clear all chip for a single filter, which has its own X", () => {
  renderBar({ selectedStyleId: "style1" });
  expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
});

it("says how many styles are hidden and links to where they can be shown again", () => {
  renderBar({ hiddenStyleCount: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Filter questions" }));
  expect(screen.getByText("2 styles are hidden.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Show hidden styles in Settings" })).toHaveAttribute(
    "href",
    "/settings?expand=manage-styles",
  );
});

it("uses the singular for one hidden tone, and says nothing on Topic", () => {
  renderBar({ hiddenToneCount: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Filter questions" }));
  fireEvent.click(screen.getByRole("tab", { name: "Tone" }));
  expect(screen.getByText("1 tone is hidden.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Show hidden tones in Settings" })).toHaveAttribute(
    "href",
    "/settings?expand=manage-tones",
  );
  fireEvent.click(screen.getByRole("tab", { name: "Topic" }));
  expect(screen.queryByText(/hidden/)).not.toBeInTheDocument();
});
