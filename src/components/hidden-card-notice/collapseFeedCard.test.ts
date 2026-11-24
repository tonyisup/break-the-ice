import { beforeEach, expect, it, vi } from "vitest";
import { collapseFeedCard } from "./collapseFeedCard";

const mocks = vi.hoisted(() => ({ animate: vi.fn() }));
vi.mock("framer-motion", () => ({ animate: mocks.animate }));

const stop = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.animate.mockReturnValue({ stop });
});

function feedCard(rect: { top: number; bottom: number; height: number }, withPrompt = false) {
  const list = document.createElement("div");
  list.style.rowGap = "24px";
  const wrapper = document.createElement("div");
  const card = document.createElement("div");
  wrapper.append(card);
  if (withPrompt) wrapper.append(document.createElement("div"));
  list.append(wrapper);
  document.body.append(list);
  card.getBoundingClientRect = () => rect as DOMRect;
  return { card, wrapper };
}

const collapseOptions = () => mocks.animate.mock.calls[1][2];

it("leaves an off-screen card to be removed right away", () => {
  const onDone = vi.fn();
  const { card } = feedCard({ top: -300, bottom: -200, height: 100 });
  expect(collapseFeedCard(card, onDone)).toBeNull();
  expect(mocks.animate).not.toHaveBeenCalled();
  expect(card.inert).toBeFalsy();
  expect(onDone).not.toHaveBeenCalled();
});

it("closes the card and the gap after it, then reports done", () => {
  const onDone = vi.fn();
  const { card, wrapper } = feedCard({ top: 100, bottom: 200, height: 100 });
  const stopCollapse = collapseFeedCard(card, onDone);
  expect(card.inert).toBe(true);

  collapseOptions().onUpdate(1);
  expect(card.style.height).toBe("0px");
  expect(wrapper.style.marginBottom).toBe("-24px");
  collapseOptions().onComplete();
  expect(onDone).toHaveBeenCalledOnce();

  stopCollapse?.();
  expect(stop).toHaveBeenCalledTimes(2);
});

it("closes the gap inside the wrapper when a prompt sits under the card", () => {
  const { card, wrapper } = feedCard({ top: 100, bottom: 200, height: 100 }, true);
  wrapper.style.rowGap = "24px";
  collapseFeedCard(card, vi.fn());
  collapseOptions().onUpdate(1);
  expect(card.style.marginBottom).toBe("-24px");
  expect(wrapper.style.marginBottom).toBe("");
});
