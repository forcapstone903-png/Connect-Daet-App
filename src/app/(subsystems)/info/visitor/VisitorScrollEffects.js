'use client'

import { useEffect, useRef } from 'react'
import styles from './VisitorScrollEffects.module.css'

// Viewport progress works even inside mobile horizontal card lists.
export default function VisitorScrollEffects({ children, className = '' }) {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const positions = new Map()
    let cards = []
    let frame = null
    const reset = (card) => {
      card.style.removeProperty('--scroll-lift')
      card.style.removeProperty('--scroll-opacity')
      positions.delete(card)
    }
    const update = () => {
      frame = null
      const reduced = preference.matches || document.documentElement.dataset.reduceMotion === 'true'
      const height = window.innerHeight
      // Batch layout reads; remove our prior translation from the measurement.
      const measurements = cards.map((card) => ({
        card, top: card.getBoundingClientRect().top - (positions.get(card) || 0),
      }))
      for (const { card, top } of measurements) {
        if (reduced || card.contains(document.activeElement)) {
          reset(card)
          continue
        }
        const progress = Math.max(0, Math.min(1, (height - top) / (height * 0.35)))
        const lift = (1 - progress) * 48
        positions.set(card, lift)
        card.style.setProperty('--scroll-lift', `${lift.toFixed(2)}px`)
        card.style.setProperty('--scroll-opacity', (0.4 + progress * 0.6).toFixed(4))
      }
    }
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update)
    }
    const collect = () => {
      const nextCards = Array.from(root.querySelectorAll('[data-scroll-card]'))
      for (const card of cards) {
        if (!nextCards.includes(card)) reset(card)
      }
      cards = nextCards
      schedule()
    }
    // Include cards inserted by asynchronous fetches and category filtering.
    const contentObserver = new MutationObserver(collect)
    contentObserver.observe(root, { childList: true, subtree: true })
    const settingsObserver = new MutationObserver(schedule)
    settingsObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-reduce-motion'],
    })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resizeObserver?.observe(root)
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    root.addEventListener('focusin', schedule)
    root.addEventListener('focusout', schedule)
    preference.addEventListener('change', schedule)
    collect()

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      contentObserver.disconnect()
      settingsObserver.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      root.removeEventListener('focusin', schedule)
      root.removeEventListener('focusout', schedule)
      preference.removeEventListener('change', schedule)
      cards.forEach(reset)
    }
  }, [])

  return <main ref={rootRef} className={`${styles.page} ${className}`}>{children}</main>
}
