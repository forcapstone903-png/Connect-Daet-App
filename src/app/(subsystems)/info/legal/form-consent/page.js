export default function FormConsentPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Legal</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Form Consent</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            By submitting a form, you consent to the collection, use, and storage of the information you provide for account handling, support, moderation, security, and service improvement.
          </p>

          <div className="mt-8 space-y-6">
            <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
              <h2 className="text-lg font-bold text-slate-900">Purpose</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Forms may be used for sign-up, contact requests, bookings, support, accessibility requests, and content submissions.</p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Consent</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Submitting the form confirms that you understand this notice and agree to the use of your information for the stated purpose. Optional fields are clearly identified.</p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Withdrawal</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">You may withdraw consent for non-essential processing by contacting the platform administrator or updating your settings where available.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
