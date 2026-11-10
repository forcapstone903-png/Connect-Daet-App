'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from 'lucide-react';
import MediaLightbox from './MediaLightbox';

/**
 * Media viewer used on the post detail page.
 * - Shows one complete image at a time without making the page horizontally scrollable.
 * - Counter pill, compact dot navigation, arrow/keyboard controls and a fullscreen viewer.
 * - object-contain: nothing is ever cropped; broken images fall back
 *   gracefully instead of breaking the page.
 * - `resolveUrl` maps stored media references to browsable URLs.
 */
export default function PostMediaCarousel({ images, resolveUrl = (url) => url, ariaLabel }) {
  const safeImages = (Array.isArray(images) ? images : [])
    .map((item) => (typeof item === 'string' ? { url: item, alt: '' } : item))
    .map((item) => (item && typeof item.url === 'string' ? { ...item, url: item.url.trim() } : null))
    .filter((item) => item && item.url);
  const total = safeImages.length;
  const imageKey = JSON.stringify(safeImages.map((item) => item.url));

  const [selection, setSelection] = useState(() => ({ imageKey, index: 0 }));
  const [failed, setFailed] = useState(() => new Set());
  const [viewer, setViewer] = useState(null); // { startIndex }
  const index = selection.imageKey === imageKey ? selection.index : 0;

  const selectIndex = (next) => {
    if (total === 0) return;
    const clamped = Math.min(Math.max(next, 0), total - 1);
    setSelection({ imageKey, index: clamped });
  };
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectIndex(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectIndex(index + 1);
    }
  };

  if (total === 0) return null;

  const resolved = safeImages.map((image) => ({ ...image, url: resolveUrl(image.url) }));
  const activeIndex = Math.min(index, total - 1);

  return (
    <section
      aria-label={ariaLabel || `Post media, ${total} image${total === 1 ? '' : 's'}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none dark:border-[#26344a] dark:bg-[#131d2c]"
    >
      <div
        className="flex h-[min(56vw,280px)] w-full items-center justify-center sm:h-[min(38vw,380px)]"
      >
        {failed.has(resolved[activeIndex].url) ? (
          <div className="flex flex-col items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <ImageOff className="h-7 w-7" aria-hidden="true" />
            <span>This image could not be loaded.</span>
          </div>
        ) : (
          <img
            src={resolved[activeIndex].url}
            alt={resolved[activeIndex].alt || `Image ${activeIndex + 1} of ${total}`}
            loading="eager"
            draggable={false}
            onError={() => setFailed((previous) => new Set(previous).add(resolved[activeIndex].url))}
            className="h-full w-full select-none object-contain"
          />
        )}
      </div>
      {/* Counter pill + fullscreen expand */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <span
          aria-live="polite"
          className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold tabular-nums text-white backdrop-blur-sm"
        >
          {activeIndex + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => setViewer({ startIndex: activeIndex })}
          aria-label="Open fullscreen viewer"
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Keep image navigation available without a swipe-scroll track. */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => selectIndex(activeIndex - 1)}
            aria-label="Previous image"
            disabled={activeIndex === 0}
            className="absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/65 disabled:opacity-40 sm:left-3 sm:h-10 sm:w-10"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => selectIndex(activeIndex + 1)}
            aria-label="Next image"
            disabled={activeIndex === total - 1}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/65 disabled:opacity-40 sm:right-3 sm:h-10 sm:w-10"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      )}

      {/* Dot navigation */}
      {total > 1 && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 pb-3">
          {safeImages.map((item, dotIndex) => (
            <button
              key={`dot-${item.url}-${dotIndex}`}
              type="button"
              onClick={() => selectIndex(dotIndex)}
              aria-label={`Go to image ${dotIndex + 1} of ${total}`}
              aria-current={dotIndex === activeIndex}
              className="flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            >
              <span
                className="block rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-all"
                style={{
                  width: dotIndex === activeIndex ? 8 : 5,
                  height: 5,
                  opacity: dotIndex === activeIndex ? 1 : 0.55,
                }}
              />
            </button>
          ))}
        </div>
      )}

      {viewer && (
        <MediaLightbox
          items={resolved}
          startIndex={viewer.startIndex}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}
