// Shared post-media helpers. Used by the feed card, the blog detail page and
// any other surface that renders post images, so gallery + lightbox behaviour
// stays identical everywhere (see PostMediaGallery / MediaLightbox).

/**
 * Normalize the various shapes post media is stored in (plain URL strings,
 * `{ url, type }` objects, `{ image_url }` rows) into a stable list:
 *   [{ url: string, type: 'image', alt: string }]
 * Null / empty / non-string URLs are filtered out and duplicates removed.
 */
export function getPostImages(post) {
  const items = [];
  const seen = new Set();

  const push = (value) => {
    if (!value) return;
    let url = '';
    let alt = '';
    if (typeof value === 'string') {
      url = value.trim();
    } else if (typeof value === 'object') {
      url = String(value.url || value.image_url || value.path || '').trim();
      alt = typeof value.alt === 'string' ? value.alt : (typeof value.caption === 'string' ? value.caption : '');
      const kind = String(value.type || value.kind || 'image').toLowerCase();
      // Slideshow/gallery covers images only; videos keep their existing renderer.
      if (kind && kind !== 'image' && kind !== 'photo' && kind !== 'picture') return;
    }
    if (!url || !/^https?:\/\//i.test(url) && !url.startsWith('/')) return;
    if (seen.has(url)) return;
    seen.add(url);
    items.push({ url, type: 'image', alt });
  };

  if (Array.isArray(post?.images)) post.images.forEach(push);
  if (Array.isArray(post?.media)) post.media.forEach(push);
  else if (typeof post?.media === 'string' && post.media.trim()) push(post.media);
  if (typeof post?.featured_image === 'string' && post.featured_image.trim()) push(post.featured_image);

  return items;
}

/**
 * Resolve a stored media reference to a browsable URL. Handles full URLs
 * (Supabase public URL or external) and bare storage paths.
 */
export function resolveMediaUrl(url, supabase) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('data:')) return trimmed;
  if (supabase) {
    try {
      const { data } = supabase.storage.from('media').getPublicUrl(trimmed);
      if (data?.publicUrl) return data.publicUrl;
    } catch {
      /* fall through to raw value */
    }
  }
  return trimmed;
}
