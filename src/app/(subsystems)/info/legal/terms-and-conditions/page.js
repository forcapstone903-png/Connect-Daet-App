const clauses = [
  {
    heading: 'Scope and eligibility',
    body: 'By using DAET Connect, you confirm that you are legally permitted to use the service and that you will comply with applicable laws and community guidelines.'
  },
  {
    heading: 'Account responsibility',
    body: 'You are responsible for maintaining the confidentiality of your account and for the accuracy of the information you provide. You must not impersonate others or misuse the platform.'
  },
  {
    heading: 'User-generated content',
    body: 'You retain ownership of content you submit, but by posting it, you grant the platform a limited right to host, display, and moderate it within the service.'
  },
  {
    heading: 'Third-party tools',
    body: 'The platform may use map, weather, image, and analytics services. Those tools may have their own terms and privacy rules, and their availability may change.'
  },
  {
    heading: 'Prohibited use',
    body: 'You may not use the platform for spam, fraud, harassment, unlawful content, or interference with the platform or other users.'
  },
  {
    heading: 'Service changes',
    body: 'We may update, suspend, or remove features to maintain security, reliability, or legal compliance. We will try to communicate significant changes where practical.'
  },
  {
    heading: 'Limitation of liability',
    body: 'The service is provided as-is. We do not guarantee uninterrupted access, perfect accuracy, or guaranteed outcomes, except where required by law.'
  },
  {
    heading: 'Governing law',
    body: 'These terms are governed by Philippine law unless a separate agreement or applicable legal requirement requires otherwise.'
  },
]

export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Legal</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Terms and Conditions</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            These terms govern your use of DAET Connect. By using the service, you agree to comply with these terms and applicable local laws.
          </p>

          <div className="mt-8 space-y-6">
            {clauses.map((clause) => (
              <section key={clause.heading} className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
                <h2 className="text-lg font-bold text-slate-900">{clause.heading}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">{clause.body}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
