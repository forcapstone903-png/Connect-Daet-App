const policySections = [
  {
    heading: 'Information we collect',
    body: 'We collect details you provide directly such as your name, email, profile information, and messages. We also collect technical data such as device type, browser details, IP address, and usage information to maintain security and improve the platform.'
  },
  {
    heading: 'How we use your information',
    body: 'We use personal data to operate accounts, support community features, deliver messaging, protect security, comply with legal obligations, and improve service quality. We do not sell personal data.'
  },
  {
    heading: 'Sharing and disclosures',
    body: 'We may share limited information with secure hosting providers, analytics tools only with consent, and public authorities where required by law or to prevent fraud, abuse, or safety issues.'
  },
  {
    heading: 'Your rights',
    body: 'You may request access, correction, deletion, or restriction of your data where applicable. You may also withdraw consent for optional analytics at any time from the cookie preferences or account settings.'
  },
  {
    heading: 'Retention and security',
    body: 'We keep personal data only as long as needed for the service, legal obligations, or dispute resolution. We use reasonable technical and organizational safeguards, but no system is completely risk-free.'
  },
  {
    heading: 'Contact',
    body: 'For privacy requests or questions, contact the platform administrator or support contact listed on the service.'
  },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Legal</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Privacy Policy</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This policy explains how DAET Connect handles personal information and how we protect user privacy.
          </p>

          <div className="mt-8 space-y-6">
            {policySections.map((section) => (
              <section key={section.heading} className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
                <h2 className="text-lg font-bold text-slate-900">{section.heading}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
            This is a practical compliance baseline. Final legal review should be completed by counsel before public launch, especially for local privacy and consumer rules.
          </div>
        </div>
      </div>
    </main>
  )
}
