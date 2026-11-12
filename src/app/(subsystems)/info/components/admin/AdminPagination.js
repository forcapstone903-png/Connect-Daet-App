import { ChevronLeft, ChevronRight } from 'lucide-react'

function getPageItems(page, totalPages) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const start = Math.max(2, Math.min(page - 1, totalPages - 3))
  const end = Math.min(totalPages - 1, start + 2)
  const items = [1]

  if (start > 2) items.push('start-ellipsis')
  for (let value = start; value <= end; value += 1) items.push(value)
  if (end < totalPages - 1) items.push('end-ellipsis')
  items.push(totalPages)
  return items
}

export default function AdminPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'results',
  disabled = false,
  showSummary = true,
  className = '',
}) {
  const pageCount = Math.max(0, Math.floor(Number(totalPages) || 0))
  if (pageCount <= 1) return null

  const currentPage = Math.max(1, Math.min(Math.floor(Number(page) || 1), pageCount))
  const itemCount = Math.max(0, Number(totalItems) || 0)
  const itemsPerPage = Math.max(1, Number(pageSize) || 1)
  const firstItem = itemCount ? (currentPage - 1) * itemsPerPage + 1 : 0
  const lastItem = Math.min(currentPage * itemsPerPage, itemCount)
  const pageItems = getPageItems(currentPage, pageCount)
  const rootClassName = [
    'admin-pagination',
    showSummary ? '' : 'admin-pagination-controls-only',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      {showSummary ? (
        <p className="admin-pagination-summary" aria-live="polite">
          Showing {firstItem}–{lastItem} of {itemCount} {itemLabel}
        </p>
      ) : null}
      <nav className="admin-pagination-controls" aria-label="Pagination">
        <button
          type="button"
          className="admin-pagination-button admin-pagination-direction"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={disabled || currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden="true" />
          <span className="admin-pagination-direction-label">Previous</span>
        </button>
        {pageItems.map((item) => (
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              className={`admin-pagination-button admin-pagination-page${item === currentPage ? ' is-current' : ''}`}
              onClick={() => onPageChange(item)}
              disabled={disabled}
              aria-label={`Go to page ${item}`}
              aria-current={item === currentPage ? 'page' : undefined}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="admin-pagination-ellipsis" aria-hidden="true">…</span>
          )
        ))}
        <button
          type="button"
          className="admin-pagination-button admin-pagination-direction"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={disabled || currentPage >= pageCount}
          aria-label="Next page"
        >
          <span className="admin-pagination-direction-label">Next</span>
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>
    </div>
  )
}
