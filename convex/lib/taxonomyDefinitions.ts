import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { briefLine } from "./brief";

/** A judge reads these next to each question, and gets less accurate as its input grows. */
const MAX_DEFINITION_CHARS = 300;

function shortDefinition(line: string): string {
  const text = line.replace(/\s+/g, " ").trim();
  return text.length > MAX_DEFINITION_CHARS ? `${text.slice(0, MAX_DEFINITION_CHARS - 1)}…` : text;
}

export const taxonomyDefinition = v.object({ slug: v.string(), name: v.string(), definition: v.string() });
type TaxonomyDefinition = Infer<typeof taxonomyDefinition>;

/**
 * A style, tone and topic as a judge reads them: the same one line each has in the generator's
 * prompt (lib/brief.ts), so fit is measured against what the model was asked to do.
 */
export function taxonomyDefinitions(
  style: Doc<"styles">,
  tone: Doc<"tones">,
  topic: Doc<"topics"> | null,
): { style: TaxonomyDefinition; tone: TaxonomyDefinition; topic: TaxonomyDefinition | null } {
  return {
    style: { slug: style.slug ?? style.id, name: style.name, definition: shortDefinition(briefLine(style)) },
    tone: { slug: tone.slug ?? tone.id, name: tone.name, definition: shortDefinition(briefLine(tone)) },
    topic: topic
      ? { slug: topic.slug ?? topic.id, name: topic.name, definition: shortDefinition(briefLine(topic)) }
      : null,
  };
}
