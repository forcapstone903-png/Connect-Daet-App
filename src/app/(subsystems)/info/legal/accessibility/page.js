export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Accessibility</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Accessibility Statement</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            DAET Connect aims to provide an accessible and readable experience for all users, including people using keyboard navigation and assistive technology.
          </p>

          <div className="mt-8 space-y-6">
            <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
              <h2 className="text-lg font-bold text-slate-900">Keyboard and focus</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Navigation and forms should be usable without a mouse, with clear focus states on interactive elements.</p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Alt text and media</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Images and media should include meaningful text alternatives and avoid meaningless labels when decorative content is not required.</p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Contrast and readability</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">Text and controls are designed to maintain sufficient contrast and avoid relying on color alone to communicate meaning.</p>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-bold text-slate-900">Feedback</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">If an accessibility issue is identified, please contact the administrator with the page name and the problem details so it can be addressed.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
