import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { latestActiveVersion, latestVersion, uniqueByKey } from "./taxonomy";

type TaxonomyTable = "styles" | "tones" | "topics";
type TaxonomyDoc = Doc<"styles"> | Doc<"tones"> | Doc<"topics">;

/**
 * Every version of a style, tone or topic: rows that share the slug, plus rows from before
 * versioning that only have the legacy `id`. Several rows can match one slug, so a lookup by
 * slug must pick a version rather than call `.unique()` or `.first()`.
 */
export async function findTaxonomyVersions(
  db: QueryCtx["db"],
  table: TaxonomyTable,
  slug: string,
): Promise<TaxonomyDoc[]> {
  const [bySlug, byLegacyId] = await Promise.all([
    db.query(table as "styles").withIndex("by_slug", (q) => q.eq("slug", slug)).collect(),
    db.query(table as "styles").withIndex("by_my_id", (q) => q.eq("id", slug)).collect(),
  ]);
  return uniqueByKey<TaxonomyDoc>([...bySlug, ...byLegacyId], (row) => row._id);
}

/**
 * The version a slug refers to: its active version, else its newest. Only the shared entries
 * count, never one a workspace owned.
 */
export async function resolveTaxonomySlug<T extends TaxonomyTable>(
  db: QueryCtx["db"],
  table: T,
  slug: string,
): Promise<Doc<T> | null> {
  const versions = (await findTaxonomyVersions(db, table, slug)).filter((row) => !row.organizationId);
  return (latestActiveVersion(versions) ?? latestVersion(versions)) as unknown as Doc<T> | null;
}
