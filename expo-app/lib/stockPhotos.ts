/**
 * stockPhotos.ts
 *
 * Shared placeholder photo banks used while real listing photos are not yet
 * uploaded. Both the web modal (PropertyDetailModal) and the native property
 * route (app/property/[id].tsx) pull from here so a single update covers both.
 *
 * TODO: Remove once real per-listing photo storage is in place.
 */

export const EXTERIOR_PHOTOS = [
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
];

export const INTERIOR_PHOTOS = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1200&q=80",
];

/**
 * Returns a deterministic photo list for a listing.
 * Hero photo comes from `listing.imageUrl` when available; the rest are
 * seeded interior stock shots so each listing shows a different set.
 */
export function getPhotos(listing: { price: number; imageUrl?: string | null }): string[] {
  const seed = listing.price ?? 0;
  const hero = listing.imageUrl ?? EXTERIOR_PHOTOS[seed % EXTERIOR_PHOTOS.length];
  const rest = INTERIOR_PHOTOS.map((_, i) => INTERIOR_PHOTOS[(seed + i) % INTERIOR_PHOTOS.length]);
  return [hero, ...rest];
}
