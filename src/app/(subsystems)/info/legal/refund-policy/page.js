export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Legal</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Refund Policy</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Refunds are considered only when a paid service was not delivered, was defective, or materially differed from the description provided.
          </p>

          <div className="mt-8 space-y-6">
            <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
              <h2 className="text-lg font-bold text-slate-900">Eligibility</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Requests should be made within a reasonable time after purchase and should include the transaction details and proof of the issue. Some services may be non-refundable after booking or delivery.</p>
            </section>

            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Processing</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Approved refunds are returned through the original payment method, subject to provider processing times and any third-party payment terms.</p>
            </section>

            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Partner rules</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Where a booking or service is handled by a third-party partner, that partner’s refund policy may apply in addition to this general policy.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
