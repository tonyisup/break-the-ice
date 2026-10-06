import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/** A judge reads these next to each question, and gets less accurate as its input grows. */
const MAX_DEFINITION_CHARS = 300;

export function shortDefinition(parts: Array<string | undefined>): string {
  const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text.length > MAX_DEFINITION_CHARS ? `${text.slice(0, MAX_DEFINITION_CHARS - 1)}…` : text;
}

export const taxonomyDefinition = v.object({ slug: v.string(), name: v.string(), definition: v.string() });
export type TaxonomyDefinition = Infer<typeof taxonomyDefinition>;

/**
 * Short definitions of a style, tone and topic, using the fields the generator is given, so a
 * judge measures fit against what the model was asked to do.
 */
export function taxonomyDefinitions(
  style: Doc<"styles">,
  tone: Doc<"tones">,
  topic: Doc<"topics"> | null,
): { style: TaxonomyDefinition; tone: TaxonomyDefinition; topic: TaxonomyDefinition | null } {
  // The prompt shows a style's `examples` (not the legacy single `example`) and no topic examples.
  const styleExample = style.examples?.[0]?.text;
  return {
    style: {
      slug: style.slug ?? style.id,
      name: style.name,
      definition: shortDefinition([
        style.description,
        `Structure: ${style.structuralInstruction ?? style.structure}`,
        styleExample ? `Example: ${styleExample}` : undefined,
      ]),
    },
    tone: {
      slug: tone.slug ?? tone.id,
      name: tone.name,
      definition: shortDefinition([
        tone.description ?? tone.aiGuidance ?? tone.promptGuidanceForAI,
        tone.languageCues?.length ? `Sounds: ${tone.languageCues.join(", ")}.` : undefined,
      ]),
    },
    topic: topic
      ? {
          slug: topic.slug ?? topic.id,
          name: topic.name,
          definition: shortDefinition([
            topic.description,
            topic.scopeBoundaries?.length ? `Covers: ${topic.scopeBoundaries.join(", ")}.` : undefined,
          ]),
        }
      : null,
  };
}
