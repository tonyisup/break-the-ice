import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { PlanAllowances } from "./PlanAllowances";

const convex = { query: vi.fn() };
vi.mock("convex/react", () => ({ useConvex: () => convex }));
beforeEach(() => { convex.query.mockReset(); });

test("shows actual allowances and recovers from a failed request", async () => {
  convex.query.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ free: 12, team: 120, cycleDays: 30 });
  render(<PlanAllowances />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByText("12 on Free")).toBeInTheDocument();
  expect(screen.getByText("120 on Team")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});
