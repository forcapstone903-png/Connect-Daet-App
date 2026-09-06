'use client'

import { useEffect, useRef } from 'react'

export default function ConfirmationModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', isDangerous = false }) {
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const modalRef = useRef(null)

  // Focus management: move focus into the dialog when it opens, restore it on close,
  // trap Tab navigation inside, and close on Escape.
  useEffect(() => {
    if (!isOpen) return undefined

    const previouslyFocused = document.activeElement
    const focusTimer = window.setTimeout(() => {
      cancelRef.current?.focus()
    }, 0)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }

      if (event.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement

        if (event.shiftKey && (active === first || active === modalRef.current)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      aria-describedby="confirmation-modal-message"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />

      {/* Modal */}
      <div ref={modalRef} className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id="confirmation-modal-title" className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p id="confirmation-modal-message" className="text-sm text-slate-600">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20 focus:ring-red-500'
                : 'bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-500/20 focus:ring-sky-500'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
