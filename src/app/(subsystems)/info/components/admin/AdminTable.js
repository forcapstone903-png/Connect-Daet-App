// Table primitives for admin data grids: the wrapper handles horizontal
// scrolling on small screens and the footer row keeps counts/actions aligned.
export default function AdminTable({ children, className = '', wrapClassName = '' }) {
  return (
    <div className={`admin-table-wrap ${wrapClassName}`.trim()}>
      <table className={`admin-table ${className}`.trim()}>{children}</table>
    </div>
  )
}

export function AdminTableFooter({ children, className = '' }) {
  return <div className={`admin-panel-foot ${className}`.trim()}>{children}</div>
}