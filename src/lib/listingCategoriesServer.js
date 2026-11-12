const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205'])

/**
 * The listing's category must be on the managed list for its type
 * (Settings -> Categories). New listings need an active category; edits may
 * keep a category that has since been hidden. Before migration 102 there is
 * no list, so any category is accepted as before.
 */
export async function validateListingCategory(client, listingType, category, { allowHidden = false } = {}) {
  const { data, error } = await client
    .from('listing_categories')
    .select('slug, is_active')
    .eq('listing_type', listingType)
    .eq('slug', category)
    .maybeSingle()
  if (error) {
    if (MISSING_RELATION_CODES.has(error.code)) return null
    throw error
  }
  if (!data) return 'Choose a category from the managed list, or add it under Categories first.'
  if (!data.is_active && !allowHidden) return 'This category is hidden. Choose an active category.'
  return null
}
