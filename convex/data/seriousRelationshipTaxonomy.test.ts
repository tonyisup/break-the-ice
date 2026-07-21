import { describe, expect, it } from "vitest";
import { validateGeneratedQuestion } from "../lib/promptArchitecture";
import {
  seriousRelationshipStyles,
  seriousRelationshipTones,
} from "./seriousRelationshipTaxonomy";

const supportedIcons = new Set([
  "Anchor",
  "BookOpen",
  "Heart",
  "HeartHandshake",
  "MessageCircle",
  "Scale",
  "TrendingUp",
]);

function duplicateValues(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("serious relationship taxonomy", () => {
  it("uses unique, active, versioned slugs", () => {
    const allEntries = [
      ...seriousRelationshipStyles,
      ...seriousRelationshipTones,
    ];
    const slugs = allEntries.map((entry) => entry.slug);

    expect(duplicateValues(slugs)).toEqual([]);
    expect(allEntries.every((entry) => entry.status === "active")).toBe(true);
    expect(allEntries.every((entry) => entry.version === 1)).toBe(true);
  });

  it("keeps every positive example valid as a single card question", () => {
    const examples = [
      ...seriousRelationshipStyles.flatMap((style) => style.examples),
      ...seriousRelationshipTones.flatMap((tone) => tone.examples),
    ];

    for (const example of examples) {
      expect(validateGeneratedQuestion(example.text), example.text).toEqual([]);
    }
  });

  it("defines clear safety and failure boundaries", () => {
    const allEntries = [
      ...seriousRelationshipStyles,
      ...seriousRelationshipTones,
    ];

    for (const entry of allEntries) {
      expect(entry.safetyNotes.length).toBeGreaterThan(40);
      expect(entry.commonFailureModes.length).toBeGreaterThanOrEqual(4);
      expect(entry.antiExamples.length).toBeGreaterThanOrEqual(1);
      expect(entry.distinctFrom.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("makes the new tones serious and intimacy-capable by construction", () => {
    for (const tone of seriousRelationshipTones) {
      expect(tone.emotionalAxes.seriousness).toBeGreaterThanOrEqual(4);
      expect(tone.emotionalAxes.intimacy).toBeGreaterThanOrEqual(4);
      expect(tone.emotionalAxes.playfulness).toBeLessThanOrEqual(1);
    }
  });

  it("only uses icons supported by the current application icon map", () => {
    const icons = [
      ...seriousRelationshipStyles.map((style) => style.icon),
      ...seriousRelationshipTones.map((tone) => tone.icon),
    ];

    expect(icons.every((icon) => supportedIcons.has(icon))).toBe(true);
  });
});
