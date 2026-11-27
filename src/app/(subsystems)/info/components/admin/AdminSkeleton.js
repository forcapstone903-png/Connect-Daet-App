function AdminSkeletonBlock({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />
}

export function AdminTableSkeleton({ rows = 5, columns = 5 }) {
  const columnTemplate = `repeat(${columns}, minmax(0, 1fr))`

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-hidden="true">
      <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4" style={{ gridTemplateColumns: columnTemplate }}>
        {Array.from({ length: columns }, (_, index) => (
          <AdminSkeletonBlock key={index} className="h-3 w-3/4" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid gap-4 px-5 py-4" style={{ gridTemplateColumns: columnTemplate }}>
            {Array.from({ length: columns }, (_, column) => (
              <AdminSkeletonBlock key={column} className={`h-4 ${column === 0 ? 'w-4/5' : 'w-2/3'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminPanelSkeleton({ rows = 3, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`} aria-hidden="true">
      <AdminSkeletonBlock className="mb-5 h-5 w-1/3" />
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <AdminSkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <AdminSkeletonBlock className="h-4 w-2/5" />
              <AdminSkeletonBlock className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminFormSkeleton({ sections = 2, fields = 4 }) {
  return (
    <div className="space-y-6" aria-hidden="true">
      {Array.from({ length: sections }, (_, section) => (
        <section key={section} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <AdminSkeletonBlock className="h-5 w-1/3" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, field) => (
              <div key={field} className="space-y-2">
                <AdminSkeletonBlock className="h-3 w-1/3" />
                <AdminSkeletonBlock className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function AdminPageSkeleton({ cards = 4, variant = 'table', rows = 5 }) {
  return (
    <div className="min-h-screen bg-slate-50" aria-busy="true" aria-label="Loading admin page">
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--admin-sidebar-width)] border-r border-slate-200 bg-white p-5 lg:block" aria-hidden="true">
        <AdminSkeletonBlock className="mb-10 h-10 w-3/4" />
        <div className="space-y-3">
          {Array.from({ length: 7 }, (_, index) => <AdminSkeletonBlock key={index} className="h-10 w-full rounded-xl" />)}
        </div>
      </aside>
      <main style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <header className="admin-page-header" aria-hidden="true">
          <div className="w-full space-y-3">
            <AdminSkeletonBlock className="h-3 w-24" />
            <AdminSkeletonBlock className="h-8 w-2/5 max-w-sm" />
            <AdminSkeletonBlock className="h-4 w-3/4 max-w-2xl" />
          </div>
        </header>
        <div className="admin-page-content space-y-5" aria-hidden="true">
          {cards > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: cards }, (_, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <AdminSkeletonBlock className="h-3 w-1/2" />
                  <AdminSkeletonBlock className="mt-4 h-8 w-2/5" />
                  <AdminSkeletonBlock className="mt-3 h-3 w-3/4" />
                </div>
              ))}
            </div>
          )}
          {variant === 'table' ? (
            <>
              <div className="flex flex-wrap gap-3">
                <AdminSkeletonBlock className="h-10 w-full max-w-sm rounded-full" />
                <AdminSkeletonBlock className="h-10 w-32 rounded-full" />
              </div>
              <AdminTableSkeleton rows={rows} />
            </>
          ) : variant === 'cards' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <AdminSkeletonBlock className="h-36 w-full rounded-xl" />
                  <AdminSkeletonBlock className="mt-4 h-4 w-3/4" />
                  <AdminSkeletonBlock className="mt-3 h-3 w-full" />
                  <AdminSkeletonBlock className="mt-2 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : variant === 'dashboard' ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <AdminPanelSkeleton rows={4} />
              <AdminPanelSkeleton rows={4} />
              <AdminPanelSkeleton rows={3} className="xl:col-span-2" />
            </div>
          ) : (
            <AdminPanelSkeleton rows={rows} />
          )}
        </div>
      </main>
    </div>
  )
}
