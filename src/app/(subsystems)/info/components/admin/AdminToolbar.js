// Filter / search toolbar rendered at the top of an AdminPanel, plus a search
// field that matches the console input styling.
import { Icon } from '@/app/components/Icon'

export default function AdminToolbar({ children, className = '' }) {
  return <div className={`admin-toolbar ${className}`.trim()}>{children}</div>
}

export function AdminSearch({ value, onChange, placeholder = 'Search…', label = 'Search', className = '' }) {
  return (
    <label className={`admin-search ${className}`.trim()}>
      <Icon name="search" className="h-4 w-4 flex-shrink-0" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}