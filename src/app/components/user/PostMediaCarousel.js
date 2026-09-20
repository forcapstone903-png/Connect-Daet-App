'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from 'lucide-react';
import MediaLightbox from './MediaLightbox';

/**
 * Swipe-mode media viewer used on the post detail page.
 * - Horizontal snap-scroll track showing ALL images (mobile: native swipe,
 *   desktop: side arrows + keyboard arrows).
 * - Counter pill "X / N", dot navigation and a fullscreen expand button that
 *   opens the shared MediaLightbox at the currently visible image.
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

  const trackRef = useRef(null);
  const lockScrollRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(() => new Set());
  const [viewer, setViewer] = useState(null); // { startIndex }

  useEffect(() => {
    setIndex(0);
    setFailed(new Set());
  }, [total]);

  const scrollToIndex = useCallback(
    (next) => {
      if (total === 0) return;
      const clamped = Math.min(Math.max(next, 0), total - 1);
      const track = trackRef.current;
      if (track) {
        lockScrollRef.current = true;
        track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' });
        window.setTimeout(() => { lockScrollRef.current = false; }, 450);
      }
      setIndex(clamped);
    },
    [total]
  );

  const handleScroll = useCallback(() => {
    if (lockScrollRef.current) return;
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const next = Math.min(Math.max(Math.round(track.scrollLeft / track.clientWidth), 0), total - 1);
    setIndex((current) => (next === current ? current : next));
  }, [total]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollToIndex(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollToIndex(index + 1);
      }
    },
    [index, scrollToIndex]
  );

  if (total === 0) return null;

  const resolved = safeImages.map((image) => ({ ...image, url: resolveUrl(image.url) }));

  return (
    <section
      aria-label={ariaLabel || `Post media, ${total} image${total === 1 ? '' : 's'}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none dark:border-[#26344a] dark:bg-[#131d2c]"
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex aspect-[16/10] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:aspect-[16/9]"
        style={{ touchAction: 'pan-y' }}
      >
        {resolved.map((image, imageIndex) => (
          <div
            key={`${image.url}-${imageIndex}`}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center"
          >
            {failed.has(imageIndex) ? (
              <div className="flex flex-col items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <ImageOff className="h-7 w-7" aria-hidden="true" />
                <span>This image could not be loaded.</span>
              </div>
            ) : (
              <img
                src={image.url}
                alt={image.alt || `Image ${imageIndex + 1} of ${total}`}
                loading={imageIndex === 0 ? 'eager' : 'lazy'}
                draggable={false}
                onError={() => setFailed((previous) => new Set(previous).add(imageIndex))}
                className="h-full w-full select-none object-contain"
              />
            )}
          </div>
        ))}
      </div>
      {/* Counter pill + fullscreen expand */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <span
          aria-live="polite"
          className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold tabular-nums text-white backdrop-blur-sm"
        >
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => setViewer({ startIndex: index })}
          aria-label="Open fullscreen viewer"
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Desktop arrows (mobile swipes natively) */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => scrollToIndex(index - 1)}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/65 sm:inline-flex"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollToIndex(index + 1)}
            aria-label="Next image"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/65 sm:inline-flex"
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
              onClick={() => scrollToIndex(dotIndex)}
              aria-label={`Go to image ${dotIndex + 1} of ${total}`}
              aria-current={dotIndex === index}
              className={`h-1.5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-all ${dotIndex === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
            />
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
