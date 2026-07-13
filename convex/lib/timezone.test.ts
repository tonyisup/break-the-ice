import { describe, expect, test } from "vitest";
import { getZonedCalendarDate, isValidTimeZone } from "./timezone";

describe("organization calendar dates", () => {
  test("keeps Los Angeles on Monday after UTC has advanced to Tuesday", () => {
    const instant = new Date("2026-07-14T02:30:00.000Z");
    expect(getZonedCalendarDate(instant, "America/Los_Angeles")).toEqual({
      isoDate: "2026-07-13",
      dayOfWeek: "monday",
    });
  });

  test("handles daylight-saving boundaries with IANA rules", () => {
    const instant = new Date("2026-11-01T07:30:00.000Z");
    expect(getZonedCalendarDate(instant, "America/Los_Angeles")).toEqual({
      isoDate: "2026-11-01",
      dayOfWeek: "sunday",
    });
  });

  test("rejects invalid time zones", () => {
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
