'use client';

import { useCallback, useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';

const API = '/info/api/admin/security/login-failures';

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminLoginSecurityPage() {
  const [state, setState] = useState({ failures: [], last7Days: { total: 0, perDay: {} }, loading: true, error: '' });
  const [busyKey, setBusyKey] = useState('');

  const apply = (result) => setState({ failures: result.failures || [], last7Days: result.last7Days || { total: 0, perDay: {} }, loading: false, error: '' });

  const load = useCallback(async () => {
    try {
      const response = await fetch(API, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load failed sign-ins.');
      apply(result);
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(API, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load failed sign-ins.');
        if (active) apply(result);
      })
      .catch((error) => { if (active) setState((current) => ({ ...current, loading: false, error: error.message })); });
    return () => { active = false; };
  }, []);

  const lockedCount = state.failures.filter((item) => item.locked).length;
  const days = Object.entries(state.last7Days.perDay || {}).sort(([a], [b]) => b.localeCompare(a));

  return (
    <SettingsShell title="Failed Sign-ins" subtitle="Addresses with recent failed password attempts, and any that are locked out.">
      {(showToast) => {
        const unlock = async (item) => {
          if (!window.confirm(`Unlock ${item.email} and reset its failed attempts?`)) return;
          setBusyKey(item.key);
          try {
            const response = await fetch(API, {
              method: 'DELETE',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: item.key }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.message || 'Unable to unlock.');
            showToast('Address unlocked.');
            await load();
          } catch (error) {
            showToast(error.message, true);
          } finally {
            setBusyKey('');
          }
        };

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Failed attempts, last 7 days</p><p className="mt-1 text-2xl font-bold text-slate-900">{state.last7Days.total ?? '—'}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Addresses tracked</p><p className="mt-1 text-2xl font-bold text-slate-900">{state.failures.length}</p></div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs uppercase tracking-wide text-red-700">Locked now</p><p className="mt-1 text-2xl font-bold text-red-800">{lockedCount}</p></div>
            </div>

            {state.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</p> : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Tracked addresses</h2>
              <p className="mt-1 text-xs text-slate-500">Emails are masked. A successful sign-in clears the entry automatically.</p>
              {state.loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : !state.failures.length ? (
                <p className="mt-4 text-sm text-slate-500">No failed sign-ins are being tracked.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="py-2">Email</th><th>Failures</th><th>Last attempt</th><th>Status</th><th className="sr-only">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.failures.map((item) => (
                        <tr key={item.key}>
                          <td className="py-2 font-medium text-slate-800">{item.email}</td>
                          <td>{item.failureCount}</td>
                          <td>{formatTime(item.lastFailedAt)}</td>
                          <td>{item.locked ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Locked until {formatTime(item.lockedUntil)}</span> : <span className="text-xs text-slate-500">Not locked</span>}</td>
                          <td className="text-right"><button type="button" disabled={busyKey === item.key} onClick={() => void unlock(item)} className="text-xs font-semibold text-blue-600">{item.locked ? 'Unlock' : 'Reset'}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {days.length ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800">Failed attempts by day</h2>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {days.map(([day, count]) => <li key={day} className="flex justify-between border-b border-slate-50 py-1"><span>{day}</span><span className="font-semibold">{count}</span></li>)}
                </ul>
              </section>
            ) : null}
          </div>
        );
      }}
    </SettingsShell>
  );
}
