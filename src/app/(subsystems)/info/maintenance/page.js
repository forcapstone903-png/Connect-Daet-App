export const dynamic = 'force-dynamic'

export default async function MaintenancePage({ searchParams }) {
  const params = await searchParams
  const message = typeof params?.message === 'string' && params.message.trim()
    ? params.message.slice(0, 500)
    : 'We are currently performing scheduled maintenance. Please check back soon.'

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl sm:p-12">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/15 text-3xl font-black text-amber-300" aria-hidden="true">
          !
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Connect Daet</p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">We&apos;ll be back soon</h1>
        <p className="mt-4 text-base leading-7 text-slate-300">{message}</p>
        <p className="mt-8 text-sm text-slate-400">Please try again in a little while.</p>
      </section>
    </main>
  )
}
