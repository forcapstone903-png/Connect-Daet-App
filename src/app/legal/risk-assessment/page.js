export default function RiskAssessmentPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Compliance</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Risk Assessment</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This summary highlights key compliance issues to review before public launch. It is a practical risk note and not legal advice.
          </p>

          <div className="mt-8 space-y-6">
            <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
              <h2 className="text-lg font-bold text-slate-900">Main risks</h2>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
                <li>Unverified claims, review text, and promotional statements may trigger consumer protection or defamation issues.</li>
                <li>Third-party embeds, image libraries, and analytics services need clear consent and data handling review.</li>
                <li>Personal data and messaging features require privacy notices, retention rules, and consent controls.</li>
                <li>Local tourism, booking, and refund features may need regulatory and operator review before commercialization.</li>
                <li>Accessibility and copyright issues can create both legal exposure and usability problems.</li>
              </ul>
            </section>

            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Recommended checks</h2>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
                <li>Confirm business identity and registration details before any public commercial activity.</li>
                <li>Review every image and media asset for copyright, contracts, and attribution.</li>
                <li>Only publish claims that can be supported by evidence or clear disclosure.</li>
                <li>Keep cookie consent, tracking, and analytics choices visible and reversible.</li>
                <li>Review accessibility labels, forms, and button naming before launch.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
