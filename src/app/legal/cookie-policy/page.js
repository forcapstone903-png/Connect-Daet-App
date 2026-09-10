const cookieSections = [
  {
    heading: 'What we use cookies for',
    body: 'We use cookies to keep sessions secure, remember selected preferences, and understand anonymous usage patterns. Essential cookies are active by default; analytics cookies are used only after consent.'
  },
  {
    heading: 'Types of cookies',
    body: 'Essential cookies support login, navigation, and basic security. Functional cookies remember user preferences. Analytics cookies help us improve performance and content quality.'
  },
  {
    heading: 'Your control',
    body: 'You can accept all cookies, allow essentials only, or change your settings later from the cookie banner or browser settings. Disabling analytics cookies will not block core platform functions.'
  },
  {
    heading: 'Third-party services',
    body: 'Some embedded tools or services may set their own cookies, and their use is subject to the third-party provider’s own terms and privacy practices.'
  },
]

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Legal</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Cookie Policy</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This page explains what cookies the platform uses and how you can manage them.
          </p>

          <div className="mt-8 space-y-6">
            {cookieSections.map((section) => (
              <section key={section.heading} className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
                <h2 className="text-lg font-bold text-slate-900">{section.heading}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
