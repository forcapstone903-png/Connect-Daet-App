export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">About</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">About the developers</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            CONNECT-Daet is built and maintained by a development team focused on making local discovery, community, and communication easier to use.
          </p>

          <div className="mt-8 space-y-6">
            <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
              <h2 className="text-lg font-bold text-slate-900">What we build</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                We design and maintain the platform experience, account tools, community features, and supporting services that power CONNECT-Daet.
              </p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">How to reach us</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Use the feedback link in Settings to report a problem, suggest an improvement, or share feedback with the development team.
              </p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Acknowledgements</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                CONNECT-Daet relies on open-source software and hosted services. Their licenses and terms remain applicable to the parts of the platform they support.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
