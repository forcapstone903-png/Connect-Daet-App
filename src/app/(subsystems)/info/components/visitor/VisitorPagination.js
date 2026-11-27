'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function useVisitorPage(filterKey) {
  const [pagination, setPagination] = useState({ filterKey: null, page: 1 })
  const page = pagination.filterKey === filterKey ? pagination.page : 1
  const setPage = (nextPage) => setPagination({ filterKey, page: nextPage })

  return [page, setPage]
}

export default function VisitorPagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel,
}) {
  const pageCount = Math.ceil(totalItems / pageSize)
  if (pageCount <= 1) return null

  const currentPage = Math.max(1, Math.min(page, pageCount))
  const firstItem = (currentPage - 1) * pageSize + 1
  const lastItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-slate-500" aria-live="polite">
        Showing {firstItem}–{lastItem} of {totalItems} {itemLabel}
      </p>
      <nav className="flex items-center gap-2" aria-label={`${itemLabel} pagination`}>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </button>
        <span className="min-w-20 text-center text-sm font-semibold tabular-nums text-slate-600" aria-live="polite">
          Page {currentPage} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === pageCount}
          aria-label="Next page"
          className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  )
}
