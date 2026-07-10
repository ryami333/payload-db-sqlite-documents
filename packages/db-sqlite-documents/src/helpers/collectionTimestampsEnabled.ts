import type { Payload } from "payload";

/**
 * Whether a collection keeps Payload's automatic `createdAt`/`updatedAt`
 * fields.
 *
 * Payload's config sanitiser adds those two `date` fields to every collection
 * unless it opts out with `timestamps: false` — but it never *populates* them
 * (they carry no `defaultValue`, and no core hook fills them in). Setting the
 * values is the database adapter's job, mirroring how `@payloadcms/db-mongodb`
 * leans on Mongoose's `{ timestamps: true }` and the drizzle adapters use
 * `defaultNow()` columns. The collection write handlers use this to decide
 * whether to stamp a document.
 *
 * Gated on positively finding the collection in the sanitised config: a
 * collection Payload knows about has timestamps unless it opted out with an
 * explicit `timestamps: false` (a bare `undefined` is the enabled default). A
 * slug that isn't in the config — which in practice only happens in isolated
 * unit tests — is treated as *not* enabled, so it's never stamped.
 */
export const collectionTimestampsEnabled = ({
  payload,
  slug,
}: {
  payload: Payload;
  slug: string;
}): boolean => {
  const collection = payload.config?.collections?.find(
    (candidate) => candidate.slug === slug,
  );
  return collection !== undefined && collection.timestamps !== false;
};
