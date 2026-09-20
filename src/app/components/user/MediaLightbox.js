'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';

/**
 * Shared full-screen image slideshow / lightbox.
 * - Portalled to <body> at z-[200], so post-card transforms, sheets or any
 *   other stacking context can never paint over it. No navigation, no reload,
 *   no new tab; starts at `startIndex` so the clicked thumbnail is remembered.
 * - Keyboard: Escape closes, ArrowLeft/ArrowRight navigate.
 * - Touch: swipe left/right on mobile; body scroll is locked while open.
 * - Broken images show a graceful fallback instead of crashing the viewer.
 * - `items` is the COMPLETE media list, e.g. [{ url, alt }].
 */
export default function MediaLightbox({ items, startIndex = 0, onClose }) {
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item) => (typeof item === 'string' ? { url: item, alt: '' } : item))
    .filter((item) => item && typeof item.url === 'string' && item.url.trim());
  const total = safeItems.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(total - 1, 0)));
  const [failed, setFailed] = useState(() => new Set());
  const [mounted, setMounted] = useState(false);
  const touchStartRef = useRef(null);
  const thumbsRef = useRef(null);

  useEffect(() => setMounted(true), []);

  // Keep the active thumbnail visible inside the strip.
  useEffect(() => {
    if (!mounted) return;
    const active = thumbsRef.current?.children?.[index];
    active?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index, mounted]);

  const goPrev = useCallback(() => setIndex((current) => (current - 1 + total) % total), [total]);
  const goNext = useCallback(() => setIndex((current) => (current + 1) % total), [total]);

  useEffect(() => {
    if (total === 0 || !onClose) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [total, onClose, goPrev, goNext]);

  if (total === 0 || !mounted) return null;

  const current = safeItems[Math.min(index, total - 1)];
  const hasFailed = failed.has(index);

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) goNext();
      else goPrev();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-[#05080d]/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer, image ${index + 1} of ${total}`}
      style={{ touchAction: 'none' }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top glass bar: position counter, optional caption, close */}
      <div
        className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-3 py-2.5 backdrop-blur-md sm:px-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold tabular-nums text-white">
            {index + 1}&nbsp;<span className="opacity-50">/</span>&nbsp;{total}
          </span>
          {current.alt && (
            <span className="hidden min-w-0 truncate text-sm font-semibold text-white/75 sm:block">{current.alt}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:rotate-90 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage — image always object-contain, never cropped */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 py-2 sm:px-20 sm:py-4">
        {total > 1 && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); goPrev(); }}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 sm:left-4 sm:h-12 sm:w-12"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
          {hasFailed ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm font-semibold text-white/90">
              <ImageOff className="h-8 w-8 opacity-80" aria-hidden="true" />
              <span>This image could not be loaded.</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
              >
                Close viewer
              </button>
            </div>
          ) : (
            <img
              key={current.url}
              src={current.url}
              alt={current.alt || `Image ${index + 1} of ${total}`}
              draggable={false}
              onError={() => setFailed((previous) => new Set(previous).add(index))}
              className="max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl"
            />
          )}
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); goNext(); }}
            aria-label="Next image"
            className="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 sm:right-4 sm:h-12 sm:w-12"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Footer: dot indicators (mobile) + thumbnail strip (desktop) */}
      {total > 1 && (
        <div className="shrink-0 pb-2.5" onClick={(event) => event.stopPropagation()}>
          <div className="flex justify-center gap-1.5 px-4 pb-2 sm:hidden">
            {safeItems.map((item, itemIndex) => (
              <button
                key={`dot-${item.url}-${itemIndex}`}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Go to image ${itemIndex + 1} of ${total}`}
                aria-current={itemIndex === index}
                className={`h-1.5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.65)] transition-all ${itemIndex === index ? 'w-5 bg-sky-400' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
          <div ref={thumbsRef} className="hidden justify-center gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
            {safeItems.map((item, itemIndex) => (
              <button
                key={`${item.url}-${itemIndex}`}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Go to image ${itemIndex + 1} of ${total}`}
                aria-current={itemIndex === index}
                className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${itemIndex === index ? 'ring-sky-400' : 'ring-white/10 opacity-55 hover:opacity-100'}`}
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
