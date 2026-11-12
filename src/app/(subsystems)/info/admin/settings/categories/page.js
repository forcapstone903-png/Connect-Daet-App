'use client';

import { useCallback, useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import { LISTING_TYPES } from '@/lib/listings.mjs';

async function callApi(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || `Request failed (${response.status}).`);
  return result;
}

const ALERT_API = '/info/api/admin/alerts/categories';
const LISTING_API = '/info/api/admin/listing-categories';
const EMPTY_ALERT = { name: '', description: '', icon: 'bell', sort_order: 100 };

function AlertCategories({ showToast }) {
  const [state, setState] = useState({ categories: [], icons: [], loading: true, error: '' });
  const [draft, setDraft] = useState(EMPTY_ALERT);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await callApi(ALERT_API);
      setState({ categories: result.categories || [], icons: result.icons || [], loading: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    callApi(ALERT_API)
      .then((result) => { if (active) setState({ categories: result.categories || [], icons: result.icons || [], loading: false, error: '' }); })
      .catch((error) => { if (active) setState((current) => ({ ...current, loading: false, error: error.message })); });
    return () => { active = false; };
  }, []);

  const run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      showToast(success);
      await load();
      return true;
    } catch (error) {
      showToast(error.message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800">Alert categories</h2>
      <p className="mt-1 text-sm text-slate-600">Subscribers choose these categories for real-time alerts. Hiding a category stops new alerts from using it; past alerts keep it.</p>
      {state.error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}

      <form
        className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => callApi(ALERT_API, 'POST', draft), 'Alert category added.').then((ok) => { if (ok) setDraft(EMPTY_ALERT); });
        }}
      >
        <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={60} placeholder="New category name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
        <input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={200} placeholder="Short description" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <select value={draft.icon} onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Icon">
          {(state.icons.length ? state.icons : ['bell']).map((icon) => <option key={icon} value={icon}>{icon}</option>)}
        </select>
        <button type="submit" disabled={busy} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Add</button>
      </form>

      {state.loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : (
        <ul className="mt-4 divide-y divide-slate-100">
          {state.categories.map((category) => (
            <li key={category.slug} className="py-3">
              {editing?.slug === category.slug ? (
                <form
                  className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => callApi(ALERT_API, 'PATCH', editing), 'Category saved.').then((ok) => { if (ok) setEditing(null); });
                  }}
                >
                  <input value={editing.name} onChange={(event) => setEditing((current) => ({ ...current, name: event.target.value }))} maxLength={60} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required aria-label="Name" />
                  <input value={editing.description} onChange={(event) => setEditing((current) => ({ ...current, description: event.target.value }))} maxLength={200} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" aria-label="Description" />
                  <input type="number" min="0" max="10000" value={editing.sort_order} onChange={(event) => setEditing((current) => ({ ...current, sort_order: Number(event.target.value) }))} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm" aria-label="Sort order" />
                  <button type="submit" disabled={busy} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm">Cancel</button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={`font-semibold ${category.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{category.name} <span className="text-xs font-normal text-slate-400">({category.slug} · {category.icon})</span></p>
                    <p className="text-xs text-slate-500">{category.description || 'No description'} · used {category.usage} time{category.usage === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => setEditing({ slug: category.slug, name: category.name, description: category.description || '', sort_order: category.sort_order })} className="text-blue-600">Edit</button>
                    <button type="button" disabled={busy} onClick={() => void run(() => callApi(ALERT_API, 'PATCH', { slug: category.slug, is_active: !category.is_active }), category.is_active ? 'Category hidden.' : 'Category shown.')} className="text-slate-700">{category.is_active ? 'Hide' : 'Show'}</button>
                    {!category.usage ? (
                      <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${category.name}?`)) void run(() => callApi(ALERT_API, 'DELETE', { slug: category.slug }), 'Category deleted.'); }} className="text-red-600">Delete</button>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListingCategories({ showToast }) {
  const [state, setState] = useState({ categories: [], loading: true, error: '' });
  const [type, setType] = useState('attraction');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await callApi(LISTING_API);
      setState({ categories: result.categories || [], loading: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    callApi(LISTING_API)
      .then((result) => { if (active) setState({ categories: result.categories || [], loading: false, error: '' }); })
      .catch((error) => { if (active) setState((current) => ({ ...current, loading: false, error: error.message })); });
    return () => { active = false; };
  }, []);

  const run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      showToast(success);
      await load();
      return true;
    } catch (error) {
      showToast(error.message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800">Place categories</h2>
      <p className="mt-1 text-sm text-slate-600">The categories staff can pick for attractions, accommodations, restaurants and businesses, and that visitors filter by. Tourism Officers can also manage these from the Places Directory.</p>
      {state.error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Listing type">
        {LISTING_TYPES.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={type === item.value} onClick={() => setType(item.value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${type === item.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{item.plural}</button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => callApi(LISTING_API, 'POST', { listing_type: type, name }), 'Category saved.').then((ok) => { if (ok) setName(''); });
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="New category" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
        <button type="submit" disabled={busy} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Add</button>
      </form>
      {state.loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : (
        <ul className="mt-3 divide-y divide-slate-100">
          {state.categories.filter((category) => category.listing_type === type).map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className={category.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}>{category.name} <span className="text-xs text-slate-400">· {category.usage} listing{category.usage === 1 ? '' : 's'}</span></span>
              <span className="flex gap-3 text-xs font-semibold">
                <button type="button" disabled={busy} onClick={() => {
                  const next = window.prompt('Rename category', category.name)?.trim();
                  if (next && next !== category.name) void run(() => callApi(LISTING_API, 'PATCH', { id: category.id, name: next }), 'Category renamed.');
                }} className="text-blue-600">Rename</button>
                <button type="button" disabled={busy} onClick={() => void run(() => callApi(LISTING_API, 'PATCH', { id: category.id, is_active: !category.is_active }), category.is_active ? 'Category hidden.' : 'Category shown.')} className="text-slate-700">{category.is_active ? 'Hide' : 'Show'}</button>
                {!category.usage ? <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${category.name}?`)) void run(() => callApi(LISTING_API, 'DELETE', { id: category.id }), 'Category deleted.'); }} className="text-red-600">Delete</button> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminSettingsCategories() {
  return (
    <SettingsShell title="Categories" subtitle="Manage alert categories and place categories used across the site.">
      {(showToast) => (
        <div className="space-y-6">
          <AlertCategories showToast={showToast} />
          <ListingCategories showToast={showToast} />
        </div>
      )}
    </SettingsShell>
  );
}
