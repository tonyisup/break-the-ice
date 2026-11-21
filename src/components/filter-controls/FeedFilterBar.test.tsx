import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeedFilterBar } from "./FeedFilterBar";

const styles = [
  { _id: "style1", slug: "story-driven", name: "Story driven", description: "Questions that invite a short story.", icon: "CircleHelp", color: "#667eea" },
  { _id: "style2", slug: "would-you-rather", name: "Would you rather", icon: "CircleHelp", color: "#f59e0b" },
];
const tones = [{ _id: "tone1", slug: "playful", name: "Playful", icon: "CircleHelp", color: "#10b981" }];
const topics = [{ _id: "topic1", slug: "food", name: "Food" }];

beforeEach(() => {
  // The popover measures its trigger; jsdom has no ResizeObserver.
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
  render(<FeedFilterBar styles={styles} tones={tones} topics={topics} onChange={onChange} onClearAll={vi.fn()} {...props} />);
  return onChange;
}

it("shows a pill for each filter before any is chosen", () => {
  renderBar();
  expect(screen.getByRole("button", { name: "Choose a style" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose a tone" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose a topic" })).toBeInTheDocument();
});

it("lists the choices with their descriptions and reports the chosen slug", () => {
  const onChange = renderBar();
  fireEvent.click(screen.getByRole("button", { name: "Choose a style" }));
  expect(screen.getByText("Questions that invite a short story.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Would you rather/ }));
  expect(onChange).toHaveBeenCalledWith("style", "would-you-rather");
});

it("names the chosen filter on its pill and clears it from the X", () => {
  const onChange = renderBar({ selectedStyleId: "style1" });
  expect(screen.getByRole("button", { name: "Style: Story driven. Change style" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove Story driven filter" }));
  expect(onChange).toHaveBeenCalledWith("style", null);
});

it("clears a filter from the list with the Any choice", () => {
  const onChange = renderBar({ selectedToneId: "tone1" });
  fireEvent.click(screen.getByRole("button", { name: "Tone: Playful. Change tone" }));
  fireEvent.click(screen.getByRole("button", { name: "Any tone" }));
  expect(onChange).toHaveBeenCalledWith("tone", null);
});

it("offers Clear all once two filters are set, as one step", () => {
  const onClearAll = vi.fn();
  const onChange = renderBar({ selectedStyleId: "style1", selectedToneId: "tone1", onClearAll });
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(onClearAll).toHaveBeenCalledOnce();
  // Not three separate changes, which on the feed would each start from the same URL.
  expect(onChange).not.toHaveBeenCalled();
});

it("has no Clear all for a single filter, which has its own X", () => {
  renderBar({ selectedStyleId: "style1" });
  expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
});
