import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { isPrivateUserQuestion, isQuestionPublic, isRetiredQuestion, normalizedRetirement } from "./questionAccess";

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
    ["a submission older pruning marked with only prunedAt", question({ authorId: "a", status: "approved", prunedAt: 1 }), true],
  ])("%s", (_, row, expected) => {
    expect(isPrivateUserQuestion(row)).toBe(expected);
  });
});

describe("isRetiredQuestion", () => {
  it.each([
    ["a public question", question({}), false],
    ["a pending question", question({ status: "pending" }), false],
    ["a pruned question", question({ status: "pruned", prunedAt: 1 }), true],
    ["a pruned question with no prunedAt", question({ status: "pruned" }), true],
    ["a retired duplicate", question({ status: "pruned", prunedAt: 1, duplicateOf: kept, duplicateWasPublic: true }), true],
    ["a public question older pruning marked with only prunedAt", question({ prunedAt: 1 }), true],
    ["an older question with no status, marked with only prunedAt", question({ status: undefined, prunedAt: 1 }), true],
  ])("%s", (_, row, expected) => {
    expect(isRetiredQuestion(row)).toBe(expected);
  });
});

describe("isQuestionPublic", () => {
  it.each([
    ["a public question", question({}), true],
    ["an approved question", question({ status: "approved" }), true],
    ["a public question older pruning marked with only prunedAt", question({ prunedAt: 1 }), false],
    ["an older question with no status, marked with only prunedAt", question({ status: undefined, prunedAt: 1 }), false],
    ["a pruned question", question({ status: "pruned", prunedAt: 1 }), false],
    ["a retired copy of a public question", question({ status: "pruned", prunedAt: 1, duplicateOf: kept, duplicateWasPublic: true }), true],
  ])("%s", (_, row, expected) => {
    expect(isQuestionPublic(row)).toBe(expected);
  });
});

describe("normalizedRetirement", () => {
  it.each([
    ["leaves a public question alone", question({}), { status: "public", prunedAt: undefined }],
    ["leaves a pruned question alone", question({ status: "pruned", prunedAt: 1 }), { status: "pruned", prunedAt: 1 }],
    ["leaves a pruned question with no prunedAt alone", question({ status: "pruned" }), { status: "pruned", prunedAt: undefined }],
    ["prunes a public question marked with only prunedAt", question({ prunedAt: 1 }), { status: "pruned", prunedAt: 1 }],
    ["prunes an approved question marked with only prunedAt", question({ status: "approved", prunedAt: 1 }), { status: "pruned", prunedAt: 1 }],
    ["prunes a question with no status marked with only prunedAt", question({ status: undefined, prunedAt: 1 }), { status: "pruned", prunedAt: 1 }],
    ["un-retires a question its author edited back to pending", question({ status: "pending", prunedAt: 1 }), { status: "pending", prunedAt: undefined }],
    ["un-retires a question its author edited to private", question({ status: "private", prunedAt: 1 }), { status: "private", prunedAt: undefined }],
  ])("%s", (_, row, expected) => {
    expect(normalizedRetirement(row)).toEqual(expected);
  });
});
