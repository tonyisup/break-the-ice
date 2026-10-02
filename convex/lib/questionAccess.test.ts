import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { isPrivateUserQuestion } from "./questionAccess";

const question = (fields: Partial<Doc<"questions">>) => ({ status: "public", ...fields }) as Doc<"questions">;
const kept = "kept" as Id<"questions">;

describe("isPrivateUserQuestion", () => {
  it.each([
    ["a library question, even when private", question({ status: "private" }), false],
    ["a private personal question", question({ authorId: "a", status: "private" }), true],
    ["a pending submission", question({ authorId: "a", status: "pending" }), true],
    ["an approved submission", question({ authorId: "a", status: "approved" }), false],
    ["an older submission with no status", question({ authorId: "a", status: undefined }), false],
    ["a team prompt known only by its kind", question({ kind: "team_prompt", status: "private" }), true],
    ["an organization question that isn't public", question({ organizationId: "org" as Id<"organizations">, status: "private" }), true],
    ["a retired copy of a public submission", question({ authorId: "a", status: "pruned", duplicateOf: kept, duplicateWasPublic: true }), false],
    ["a retired copy of a private submission", question({ authorId: "a", status: "pruned", duplicateOf: kept, duplicateWasPublic: false }), true],
    ["a pruned submission", question({ authorId: "a", status: "pruned" }), true],
  ])("%s", (_, row, expected) => {
    expect(isPrivateUserQuestion(row)).toBe(expected);
  });
});
