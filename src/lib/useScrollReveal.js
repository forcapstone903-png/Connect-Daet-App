'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Lightweight scroll-driven reveal hook using IntersectionObserver.
 * Each observed element receives `data-revealed="true"` once it enters the
 * viewport, allowing pure-CSS animations to take over.
 *
 * @param {{ threshold?: number, rootMargin?: string, once?: boolean }} options
 * @returns {{ observe: (el: HTMLElement | null) => void, containerRef: React.RefObject }}
 */
export function useScrollReveal({ threshold = 0.12, rootMargin = '0px 0px -40px 0px', once = true } = {}) {
  const containerRef = useRef(null)
  const observerRef = useRef(null)

  useEffect(() => {
    // Skip for users who prefer reduced motion
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-revealed', 'true')
            if (once) observer.unobserve(entry.target)
          } else if (!once) {
            entry.target.removeAttribute('data-revealed')
          }
        }
      },
      { threshold, rootMargin },
    )
    observerRef.current = observer

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [threshold, rootMargin, once])

  const observe = useCallback((el) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el)
    }
  }, [])

  return { observe, containerRef }
}

/**
 * Stagger-delay helper: returns inline style for an element at `index`.
 * Uses CSS custom property so CSS animations can reference --reveal-delay.
 */
export function staggerDelay(index, baseMs = 60, maxMs = 600) {
  const delay = Math.min(index * baseMs, maxMs)
  return { '--reveal-delay': `${delay}ms` }
}
