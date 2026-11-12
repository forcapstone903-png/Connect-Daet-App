'use client';

import { useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import { DEFAULT_GENERAL_SETTINGS } from '@/lib/siteSettings.mjs';

const SETTINGS_API = '/info/api/admin/settings';
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 px-4 py-2';

export default function AdminSettingsGeneral() {
  const [form, setForm] = useState(DEFAULT_GENERAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(SETTINGS_API, { cache: 'no-store' })
      .then(async (response) => {
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || `Unable to load settings (${response.status}).`);
        if (active) setForm({ ...DEFAULT_GENERAL_SETTINGS, ...data.settings?.general });
      })
      .catch((error) => { if (active) setLoadError(error.message || 'Unable to load saved settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <SettingsShell title="General Settings" subtitle="Site identity, contact details and municipality information shown on the public site.">
      {(showToast) => {
        const save = async () => {
          setSaving(true);
          try {
            const response = await fetch(SETTINGS_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: 'general', value: form }),
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) throw new Error(data.message || `Unable to save (${response.status}).`);
            setForm({ ...DEFAULT_GENERAL_SETTINGS, ...data.setting?.value });
            showToast('General settings saved. Public pages update within a minute.');
          } catch (error) {
            showToast(error.message || 'Unable to save general settings.', true);
          } finally {
            setSaving(false);
          }
        };

        const uploadLogo = async (file) => {
          if (!file) return;
          if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
            showToast('Use a PNG, JPEG or WebP image of 2 MB or less.', true);
            return;
          }
          setUploading(true);
          try {
            const body = new FormData();
            body.append('file', file);
            const response = await fetch('/info/api/admin/media', { method: 'POST', body, credentials: 'same-origin' });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success || !data.file?.url) throw new Error(data.message || 'Logo upload failed.');
            setForm((current) => ({ ...current, logo_url: data.file.url }));
            showToast('Logo uploaded. Save to publish it.');
          } catch (error) {
            showToast(error.message || 'Logo upload failed.', true);
          } finally {
            setUploading(false);
          }
        };

        const disabled = loading || saving || Boolean(loadError);

        return (
          <div className="space-y-6">
            {loadError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {loadError} Changes cannot be saved until the settings store is available.
              </p>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Site identity</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Site name"><input value={form.site_name} onChange={set('site_name')} maxLength={120} className={inputClass} /></Field>
                <Field label="Tagline"><input value={form.tagline} onChange={set('tagline')} maxLength={160} className={inputClass} /></Field>
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-slate-700">Logo</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {form.logo_url ? <img src={form.logo_url} alt="Current logo" className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
                    </div>
                    <label className={`cursor-pointer rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 ${disabled || uploading ? 'pointer-events-none opacity-50' : 'hover:bg-slate-50'}`}>
                      {uploading ? 'Uploading…' : 'Upload logo'}
                      <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.target.value = ''; }} />
                    </label>
                    {form.logo_url ? <button type="button" onClick={() => setForm((current) => ({ ...current, logo_url: '' }))} className="text-sm font-semibold text-red-600">Remove</button> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Shown on the About and Contact pages and public headers. PNG, JPEG or WebP, up to 2 MB.</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Contact information</h2>
              <p className="mt-1 text-sm text-slate-600">Published on the public Contact page.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Tourism office name"><input value={form.tourism_office_name} onChange={set('tourism_office_name')} maxLength={120} className={inputClass} /></Field>
                <Field label="Contact email"><input type="email" value={form.contact_email} onChange={set('contact_email')} maxLength={254} className={inputClass} /></Field>
                <Field label="Phone"><input type="tel" value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} className={inputClass} placeholder="(054) 000 0000" /></Field>
                <Field label="Emergency hotline"><input type="tel" value={form.emergency_hotline} onChange={set('emergency_hotline')} maxLength={40} className={inputClass} placeholder="911" /></Field>
                <Field label="Office address"><input value={form.office_address} onChange={set('office_address')} maxLength={300} className={inputClass} /></Field>
                <Field label="Office hours"><input value={form.office_hours} onChange={set('office_hours')} maxLength={200} className={inputClass} placeholder="Mon–Fri, 8:00 AM – 5:00 PM" /></Field>
                <Field label="Facebook page" hint="https:// address"><input type="url" value={form.facebook_url} onChange={set('facebook_url')} maxLength={300} className={inputClass} /></Field>
                <Field label="Website" hint="https:// address"><input type="url" value={form.website_url} onChange={set('website_url')} maxLength={300} className={inputClass} /></Field>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Municipality information</h2>
              <p className="mt-1 text-sm text-slate-600">Published on the public About page.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Municipality"><input value={form.municipality_name} onChange={set('municipality_name')} maxLength={80} className={inputClass} /></Field>
                <Field label="Province"><input value={form.province} onChange={set('province')} maxLength={80} className={inputClass} /></Field>
                <Field label="Region"><input value={form.region} onChange={set('region')} maxLength={80} className={inputClass} /></Field>
                <div className="md:col-span-3">
                  <Field label="About the municipality" hint={`${form.municipality_description.length}/4000 characters. Blank lines start new paragraphs.`}>
                    <textarea value={form.municipality_description} onChange={set('municipality_description')} maxLength={4000} rows={8} className={inputClass} />
                  </Field>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Regional format</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Timezone">
                  <select value={form.timezone} onChange={set('timezone')} className={inputClass}>
                    <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </Field>
                <Field label="Language">
                  <select value={form.language} onChange={set('language')} className={inputClass}>
                    <option value="English">English</option>
                    <option value="Filipino">Filipino</option>
                  </select>
                </Field>
                <Field label="Date format">
                  <select value={form.date_format} onChange={set('date_format')} className={inputClass}>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </Field>
              </div>
            </section>

            <button type="button" onClick={() => void save()} disabled={disabled} className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save general settings'}
            </button>
          </div>
        );
      }}
    </SettingsShell>
  );
}
