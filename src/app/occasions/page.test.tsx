import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OccasionsPage from "./page";
import { OCCASIONS, getOccasionAppUrl } from "@/config/occasions";

vi.mock("@/hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/PublicChrome", () => ({
  PublicHeader: () => null,
  PublicFooter: () => null,
}));

describe("OccasionsPage", () => {
  it("lists every occasion with links to its sample page and its deck", () => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    render(
      <MemoryRouter>
        <OccasionsPage />
      </MemoryRouter>,
    );

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(OCCASIONS.length);
    OCCASIONS.forEach((occasion, index) => {
      const card = within(cards[index]);
      expect(card.getByRole("link", { name: occasion.name })).toHaveAttribute(
        "href",
        `/occasions/${occasion.slug}`,
      );
      expect(card.getByRole("link", { name: /open deck/i })).toHaveAttribute(
        "href",
        getOccasionAppUrl(occasion),
      );
    });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
