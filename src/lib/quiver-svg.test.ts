import { describe, expect, it } from "vitest";

import { extractQuiverSvg } from "./quiver-svg";

describe("extractQuiverSvg", () => {
  it("extracts svg markup from Quiver's data array response", () => {
    const payload = {
      data: [
        {
          svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
          mime_type: "image/svg+xml",
        },
      ],
    };

    expect(extractQuiverSvg(payload)).toBe("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  });

  it("extracts svg markup from a JSON string payload", () => {
    const payload = JSON.stringify({
      generations: [
        {
          svg: "<?xml version=\"1.0\"?><svg></svg>",
        },
      ],
    });

    expect(extractQuiverSvg(payload)).toBe("<?xml version=\"1.0\"?><svg></svg>");
  });

  it("returns null for non-svg strings", () => {
    expect(extractQuiverSvg("https://cdn.example.com/image.svg")).toBeNull();
    expect(extractQuiverSvg("[object Object]")).toBeNull();
  });
});
