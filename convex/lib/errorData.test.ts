import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { convexErrorData } from "./errorData";

const refusal = { code: "STYLE_UNAVAILABLE", message: "That style isn't available to your workspace." };

// Encodes the data the way each function boundary does, once per layer.
function encoded(data: unknown, layers: number): unknown {
  let value = data;
  for (let layer = 0; layer < layers; layer++) value = JSON.stringify(value);
  return value;
}

describe("convexErrorData", () => {
  it("returns object data as is", () => {
    expect(convexErrorData(new ConvexError(refusal))).toEqual(refusal);
  });

  it.each([1, 2, 3])("unwraps data encoded %i time(s)", (layers) => {
    expect(convexErrorData(new ConvexError(encoded(refusal, layers) as string))).toEqual(refusal);
  });

  it("gives up past three layers", () => {
    expect(convexErrorData(new ConvexError(encoded(refusal, 4) as string))).toBeUndefined();
  });

  it("returns undefined for a string that isn't JSON", () => {
    expect(convexErrorData(new ConvexError("Not JSON"))).toBeUndefined();
  });

  it("returns undefined for JSON that isn't an object", () => {
    expect(convexErrorData(new ConvexError(JSON.stringify(42)))).toBeUndefined();
    expect(convexErrorData(new ConvexError(JSON.stringify(null)))).toBeUndefined();
  });

  it("returns undefined for an error that isn't a ConvexError", () => {
    expect(convexErrorData(new Error(JSON.stringify(refusal)))).toBeUndefined();
  });
});
