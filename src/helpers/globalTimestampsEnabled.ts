import type { Payload } from "payload";

/**
 * Whether a global keeps Payload's automatic `createdAt`/`updatedAt` fields.
 *
 * Payload's global config sanitiser *always* adds those two `date` fields —
 * globals, unlike collections, have no `timestamps: false` opt-out — but it
 * never populates them. Filling them in is the database adapter's job (the same
 * gap that {@link collectionTimestampsEnabled} covers for collections), so any
 * global the config registers should be stamped.
 *
 * Gated on positively finding the global in the sanitised config: a slug that
 * isn't registered — which in practice only happens in isolated unit tests — is
 * treated as *not* enabled, so it's never stamped.
 */
export const globalTimestampsEnabled = ({
  payload,
  slug,
}: {
  payload: Payload;
  slug: string;
}): boolean =>
  payload.config?.globals?.some((global) => global.slug === slug) ?? false;
