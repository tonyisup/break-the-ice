import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HiddenCardNotice } from "./HiddenCardNotice";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

it("counts down and then takes the card out of the feed", () => {
  const onExpire = vi.fn();
  fireEvent.pointerDown(window);
  render(<HiddenCardNotice seconds={3} wasLiked={false} onUndo={vi.fn()} onExpire={onExpire} />);
  expect(screen.getByText("Leaving the feed in 3s")).toBeInTheDocument();
  tick(1000);
  expect(screen.getByText("Leaving the feed in 2s")).toBeInTheDocument();
  expect(onExpire).not.toHaveBeenCalled();
  tick(1000);
  tick(1000);
  expect(onExpire).toHaveBeenCalledOnce();
});

it("puts a keyboard user's focus on Undo, waits while it is there, and reports an undo", () => {
  const onUndo = vi.fn();
  const onExpire = vi.fn();
  fireEvent.keyDown(window, { key: "Enter" });
  render(<HiddenCardNotice seconds={1} wasLiked onUndo={onUndo} onExpire={onExpire} />);
  expect(screen.getByRole("status")).toHaveTextContent("Question hidden and removed from Liked");
  const undo = screen.getByRole("button", { name: "Undo" });
  expect(undo).toHaveFocus();
  tick(5000);
  expect(onExpire).not.toHaveBeenCalled();
  fireEvent.click(undo);
  expect(onUndo).toHaveBeenCalledOnce();
});

it("waits while the pointer is over it", () => {
  const onExpire = vi.fn();
  fireEvent.pointerDown(window);
  const { container } = render(<HiddenCardNotice seconds={1} wasLiked={false} onUndo={vi.fn()} onExpire={onExpire} />);
  fireEvent.mouseEnter(container.firstChild as Element);
  tick(5000);
  expect(onExpire).not.toHaveBeenCalled();
  expect(screen.getByText("Paused")).toBeInTheDocument();
  fireEvent.mouseLeave(container.firstChild as Element);
  tick(1000);
  expect(onExpire).toHaveBeenCalledOnce();
});
