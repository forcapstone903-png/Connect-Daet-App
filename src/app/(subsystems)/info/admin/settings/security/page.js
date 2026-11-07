'use client';

import SettingsShell from '../_components/SettingsShell';

const securityFacts = [
  {
    title: 'Signed server session',
    detail: 'The application checks a signed, HTTP-only session cookie for protected routes and admin APIs.',
  },
  {
    title: 'Session lifetime',
    detail: 'Sessions expire after 24 hours by default, or 30 days when “Remember me” is selected.',
  },
  {
    title: 'Administrator API access',
    detail: 'Protected administrator APIs verify the server session and administrator role before processing requests.',
  },
];

export default function AdminSettingsSecurity() {
  return (
    <SettingsShell
      title="Security Settings"
      subtitle="Review the authentication protections enforced by the application."
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Active application protections</h2>
          <div className="space-y-4">
            {securityFacts.map((fact) => (
              <div key={fact.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <h3 className="font-semibold text-slate-800">{fact.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{fact.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-900">Not configurable here</h2>
          <p className="mt-2 text-sm text-amber-900">
            Two-factor authentication, login lockout thresholds, password history, and administrator approval for new accounts are not implemented as application settings. The previous controls only changed browser storage and did not enforce these policies, so they have been removed. Configure provider-level authentication policies in the Supabase project and verify them independently.
          </p>
        </section>
      </div>
    </SettingsShell>
  );
}
