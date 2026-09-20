'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MediaLightbox from './MediaLightbox';

const MAX_PREVIEW = 4;

/**
 * Shared post-image gallery (feed card + profile walls).
 * - Shows at most 4 preview tiles; the 4th carries a "+N" overlay when the
 *   post contains more images (N = total - 4).
 * - Clicking tiles 1-4 opens the shared lightbox at that image's index with
 *   the COMPLETE image list.
 * - When `detailHref` is provided, clicking the "+N / See more" tile instead
 *   routes to the post detail page, where every image is viewable in the
 *   swipe carousel (PostMediaCarousel).
 * - Clicks never bubble into the surrounding post link/card.
 * - `resolveUrl` maps stored media references to browsable URLs.
 */
export default function PostMediaGallery({ images, resolveUrl = (url) => url, detailHref }) {
  const router = useRouter();
  const [viewer, setViewer] = useState(null); // { startIndex }
  const safeImages = (Array.isArray(images) ? images : [])
    .map((item) => (typeof item === 'string' ? { url: item, type: 'image' } : item))
    .map((item) => (item && typeof item.url === 'string' ? { ...item, url: item.url.trim() } : null))
    .filter((item) => item && item.url);
  if (!safeImages.length) return null;

  const total = safeImages.length;
  const preview = safeImages.slice(0, MAX_PREVIEW);
  const hiddenCount = total - preview.length; // +N shown on the 4th tile
  const openViewer = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    setViewer({ startIndex: index });
  };
  const handleTileClick = (event, index, showOverlay) => {
    event.preventDefault();
    event.stopPropagation();
    if (showOverlay && detailHref) {
      // "+N / See more" → open the full post page with the swipe carousel.
      router.push(detailHref);
      return;
    }
    setViewer({ startIndex: index });
  };

  const gridClass = preview.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  const tileAspect =
    preview.length === 1 ? 'aspect-[16/10]'
      : preview.length === 2 ? 'aspect-[4/3]'
        : preview.length === 3 ? 'aspect-[16/9]'
          : 'aspect-square';

  return (
    <div
      className="overflow-hidden rounded-2xl"
      onClick={(event) => event.stopPropagation()}
      role="group"
      aria-label={`Post images (${total})`}
    >
      <div className={`grid gap-0.5 ${gridClass}`}>
        {preview.map((image, index) => {
          const isCoverTile = preview.length === 3 && index === 0;
          const showOverlay = hiddenCount > 0 && index === preview.length - 1;
          return (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={(event) => handleTileClick(event, index, showOverlay)}
              aria-label={showOverlay
                ? (detailHref ? `See all ${total} images on the post page` : `Show all ${total} images`)
                : `Open image ${index + 1} of ${total}`}
              className={`group relative w-full cursor-zoom-in overflow-hidden bg-slate-100 dark:bg-[#1b2638] ${isCoverTile ? 'col-span-2' : ''} ${preview.length === 1 ? 'rounded-2xl' : ''} ${tileAspect}`}
            >
              <img
                src={resolveUrl(image.url)}
                alt={image.alt || `Post image ${index + 1}`}
                loading="lazy"
                draggable={false}
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
                className="h-full w-full object-cover transition duration-300 group-hover:brightness-90"
              />
              {showOverlay && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-white transition group-hover:bg-black/70">
                  <span className="text-2xl font-extrabold leading-none tabular-nums">+{hiddenCount}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-90">See more</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {viewer && (
        <MediaLightbox
          items={safeImages.map((image) => ({ ...image, url: resolveUrl(image.url) }))}
          startIndex={viewer.startIndex}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
