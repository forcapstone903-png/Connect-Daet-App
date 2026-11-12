'use client'

// Alert broadcast console (Tourism Officer + Admin).
// Compose -> send now / schedule / draft; history with delivery and reach;
// edit, send now, cancel/withdraw, all clear; reusable templates.

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CheckCircle2, Clock, FileText, Megaphone, Pencil, Send, ShieldAlert, Trash2, X } from 'lucide-react'
import {
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminPanel,
  AdminShell,
  AdminStatCard,
} from '@/app/(subsystems)/info/components/admin'
import {
  ALERT_AUDIENCES,
  ALERT_LIMITS,
  ALERT_PHASE_LABELS,
  ALERT_SEVERITIES,
  getAlertPhase,
  getSeverity,
  summarizeReach,
} from '@/lib/alerts.mjs'
import { DAET_BARANGAYS } from '@/lib/listings.mjs'

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'draft', label: 'Drafts' },
  { value: 'history', label: 'History' },
  { value: 'templates', label: 'Templates' },
]

const SEVERITY_STYLES = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  advisory: 'border-amber-200 bg-amber-50 text-amber-800',
  warning: 'border-orange-300 bg-orange-50 text-orange-800',
  critical: 'border-red-300 bg-red-50 text-red-800',
}

const PHASE_TONES = {
  draft: 'neutral', scheduled: 'info', active: 'danger', all_clear: 'success',
  expired: 'neutral', withdrawn: 'warning', cancelled: 'neutral',
}

const EMPTY_FORM = {
  template_id: '',
  title: '',
  message: '',
  category: '',
  severity: 'advisory',
  audience: 'category',
  affected_area: '',
  barangays: [],
  delivery: 'now',
  scheduled_for: '',
  expires_at: '',
}

const MANILA = { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }
const formatTime = (value) => (value ? new Date(value).toLocaleString('en-PH', MANILA) : '—')

// <input type="datetime-local"> works in the browser's local time.
function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) throw new Error(result.message || `Request failed (${response.status})`)
  return result
}

export default function AlertsConsole() {
  const [alerts, setAlerts] = useState([])
  const [categories, setCategories] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('active')
  const [toast, setToast] = useState(null)
  const [composer, setComposer] = useState(null) // { mode: 'create'|'edit', alert?, form }
  const [templateEditor, setTemplateEditor] = useState(null) // { template?, form }
  const [actionDialog, setActionDialog] = useState(null) // { type: 'all_clear'|'cancel', alert }
  const [now, setNow] = useState(() => Date.now())

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    try {
      const result = await api('/info/api/admin/alerts')
      setAlerts(result.alerts || [])
      setCategories(result.categories || [])
      setTemplates(result.templates || [])
      setLoadError('')
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setLoading(false)
      setNow(Date.now())
    }
  }, [])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  // Push counts arrive a few seconds after sending; refresh while any are
  // pending, and every minute so scheduled alerts move to Active.
  const hasPendingPush = alerts.some((alert) => alert.sent_at && !alert.push_completed_at
    && now - new Date(alert.sent_at).getTime() < 10 * 60_000)
  useEffect(() => {
    const timer = window.setInterval(() => { void load() }, hasPendingPush ? 5_000 : 60_000)
    return () => window.clearInterval(timer)
  }, [hasPendingPush, load])

  const withPhase = useMemo(
    () => alerts.map((alert) => ({ ...alert, phase: getAlertPhase(alert, new Date(now)) })),
    [alerts, now]
  )

  const counts = useMemo(() => {
    const thirtyDaysAgo = now - 30 * 86_400_000
    const recent = withPhase.filter((alert) => alert.sent_at && new Date(alert.sent_at).getTime() >= thirtyDaysAgo)
    const delivered = recent.reduce((sum, alert) => sum + Number(alert.reach?.delivered || 0), 0)
    const opened = recent.reduce((sum, alert) => sum + Number(alert.reach?.opened || 0), 0)
    return {
      active: withPhase.filter((alert) => alert.phase === 'active').length,
      scheduled: withPhase.filter((alert) => alert.phase === 'scheduled').length,
      draft: withPhase.filter((alert) => alert.phase === 'draft').length,
      sent30: recent.length,
      openRate: delivered ? Math.round((opened / delivered) * 100) : null,
    }
  }, [withPhase, now])

  const visible = useMemo(() => {
    if (tab === 'history') return withPhase.filter((alert) => !['draft', 'scheduled', 'active'].includes(alert.phase))
    return withPhase.filter((alert) => alert.phase === tab)
  }, [withPhase, tab])

  const categoryName = (slug) => categories.find((category) => category.slug === slug)?.name || slug

  const openCreate = (template = null) => {
    const firstCategory = categories.find((category) => category.is_active)?.slug || ''
    setComposer({
      mode: 'create',
      form: template
        ? { ...EMPTY_FORM, template_id: template.id, title: template.title, message: template.message, category: template.category, severity: template.severity, affected_area: template.affected_area || '', audience: template.severity === 'critical' ? 'all' : 'category' }
        : { ...EMPTY_FORM, category: firstCategory },
    })
  }

  const openEdit = (alert) => setComposer({
    mode: 'edit',
    alert,
    form: {
      ...EMPTY_FORM,
      template_id: alert.template_id || '',
      title: alert.title,
      message: alert.message,
      category: alert.category,
      severity: alert.severity,
      audience: alert.audience,
      affected_area: alert.affected_area || '',
      barangays: alert.barangays || [],
      delivery: alert.status === 'scheduled' ? 'schedule' : alert.status === 'draft' ? 'draft' : 'now',
      scheduled_for: alert.status === 'scheduled' ? toLocalInput(alert.scheduled_for) : '',
      expires_at: toLocalInput(alert.expires_at),
    },
  })

  const runAction = async (alert, action, extra = {}) => {
    try {
      const result = await api(`/info/api/admin/alerts/${alert.id}`, 'PATCH', { action, ...extra })
      showToast(result.message)
      setActionDialog(null)
      await load()
    } catch (error) {
      showToast(error.message, true)
    }
  }

  const deleteDraft = async (alert) => {
    try {
      const result = await api(`/info/api/admin/alerts/${alert.id}`, 'DELETE')
      showToast(result.message)
      await load()
    } catch (error) {
      showToast(error.message, true)
    }
  }

  const deleteTemplate = async (template) => {
    try {
      await api(`/info/api/admin/alerts/templates/${template.id}`, 'DELETE')
      showToast('Template deleted.')
      await load()
    } catch (error) {
      showToast(error.message, true)
    }
  }

  return (
    <AdminShell
      eyebrow="Real-time alerts"
      title="Alert Broadcasts"
      description="Send weather, traffic, event and emergency alerts to residents and visitors by push notification and inbox."
      headerIcon="notifications"
      actions={<AdminButton variant="primary" icon="plus" onClick={() => openCreate()} disabled={!categories.length}>New alert</AdminButton>}
    >
      <div className="space-y-5">
        {loadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard label="Active now" value={loading ? null : counts.active} loading={loading} icon="warning" tone="danger" />
          <AdminStatCard label="Scheduled" value={loading ? null : counts.scheduled} loading={loading} icon="calendar" tone="info" />
          <AdminStatCard label="Sent (30 days)" value={loading ? null : counts.sent30} loading={loading} icon="notifications" tone="brand" />
          <AdminStatCard label="Opened (30 days)" value={loading ? null : counts.openRate === null ? '—' : `${counts.openRate}%`} loading={loading} icon="analytics" tone="success" />
        </div>

        <AdminPanel title="Alerts" bodyClassName="!p-0">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2 sm:px-5" role="tablist" aria-label="Alert status">
            {TABS.map((item) => {
              const count = item.value === 'templates' ? templates.length : item.value === 'history' ? null : counts[item.value]
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.value}
                  onClick={() => setTab(item.value)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === item.value ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {item.label}{count ? <span className="ml-1 tabular-nums text-slate-400">{count}</span> : null}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : tab === 'templates' ? (
            <TemplateList
              templates={templates}
              categoryName={categoryName}
              onUse={(template) => openCreate(template)}
              onEdit={(template) => setTemplateEditor({ template, form: { ...template } })}
              onDelete={deleteTemplate}
              onCreate={() => setTemplateEditor({ form: { name: '', title: '', message: '', category: categories[0]?.slug || '', severity: 'advisory', affected_area: '' } })}
            />
          ) : visible.length ? (
            <ul className="divide-y divide-slate-100">
              {visible.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  categoryName={categoryName}
                  onEdit={() => openEdit(alert)}
                  onSendNow={() => runAction(alert, 'send_now')}
                  onCancel={() => setActionDialog({ type: 'cancel', alert })}
                  onAllClear={() => setActionDialog({ type: 'all_clear', alert })}
                  onDelete={() => deleteDraft(alert)}
                />
              ))}
            </ul>
          ) : (
            <div className="p-8">
              <AdminEmptyState
                icon="notifications"
                title={tab === 'active' ? 'No active alerts' : `No ${TABS.find((item) => item.value === tab)?.label.toLowerCase()}`}
                description={tab === 'active' ? 'Everything is calm. Use "New alert" when the public needs to know something.' : undefined}
              />
            </div>
          )}
        </AdminPanel>
      </div>

      {composer ? (
        <AlertComposer
          composer={composer}
          categories={categories.filter((category) => category.is_active)}
          templates={templates}
          onClose={() => setComposer(null)}
          onSaved={async (message) => {
            setComposer(null)
            showToast(message)
            await load()
          }}
          onTemplateSaved={async () => {
            showToast('Saved as a template.')
            await load()
          }}
          onError={(message) => showToast(message, true)}
        />
      ) : null}

      {templateEditor ? (
        <TemplateEditor
          editor={templateEditor}
          categories={categories.filter((category) => category.is_active)}
          onClose={() => setTemplateEditor(null)}
          onSaved={async () => {
            setTemplateEditor(null)
            showToast('Template saved.')
            await load()
          }}
          onError={(message) => showToast(message, true)}
        />
      ) : null}

      {actionDialog ? (
        <ActionDialog dialog={actionDialog} onClose={() => setActionDialog(null)} onConfirm={(extra) => runAction(actionDialog.alert, actionDialog.type, extra)} />
      ) : null}

      {toast ? (
        <div role={toast.isError ? 'alert' : 'status'} aria-live={toast.isError ? 'assertive' : 'polite'} className={`admin-toast ${toast.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          {toast.message}
        </div>
      ) : null}
    </AdminShell>
  )
}

function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${SEVERITY_STYLES[severity] || SEVERITY_STYLES.advisory}`}>
      {severity === 'critical' ? <ShieldAlert className="h-3 w-3" aria-hidden="true" /> : null}
      {getSeverity(severity).label}
    </span>
  )
}

function AlertRow({ alert, categoryName, onEdit, onSendNow, onCancel, onAllClear, onDelete }) {
  const reach = summarizeReach(alert, alert.reach)
  const { phase } = alert
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <span className="text-xs font-semibold text-slate-500">{categoryName(alert.category)}</span>
          <AdminBadge tone={PHASE_TONES[phase]} dot>{ALERT_PHASE_LABELS[phase]}</AdminBadge>
          {alert.audience === 'all' ? <span className="text-xs text-slate-500">· Everyone</span> : null}
          {alert.edited_after_send ? <span className="text-xs text-slate-500">· Updated after sending</span> : null}
        </div>
        <h3 className="mt-1.5 text-sm font-bold text-slate-900">{alert.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{alert.message}</p>
        <p className="mt-1.5 text-xs text-slate-500">
          {alert.affected_area || (alert.barangays?.length ? alert.barangays.join(', ') : 'All of Daet')}
          {' · '}
          {phase === 'scheduled' ? `Sends ${formatTime(alert.scheduled_for)}` : alert.sent_at ? `Sent ${formatTime(alert.sent_at)}` : `Created ${formatTime(alert.created_at)}`}
          {alert.expires_at ? ` · Ends ${formatTime(alert.expires_at)}` : ''}
        </p>
        {phase === 'all_clear' ? <p className="mt-1 text-xs text-emerald-700">All clear {formatTime(alert.all_clear_at)}: {alert.all_clear_message}</p> : null}
        {phase === 'withdrawn' ? <p className="mt-1 text-xs text-amber-700">Withdrawn {formatTime(alert.cancelled_at)}{alert.cancel_reason ? `: ${alert.cancel_reason}` : ''}</p> : null}
      </div>

      {alert.sent_at ? (
        <dl className="grid shrink-0 grid-cols-3 gap-3 rounded-xl bg-slate-50 px-3 py-2 text-center lg:w-72">
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-500">Inboxes</dt>
            <dd className="text-sm font-bold tabular-nums text-slate-900">{reach.delivered.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-500">Opened</dt>
            <dd className="text-sm font-bold tabular-nums text-slate-900">{reach.opened.toLocaleString()} <span className="text-xs font-medium text-slate-500">({reach.openRate}%)</span></dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-500">Push</dt>
            <dd className="text-sm font-bold tabular-nums text-slate-900" title={`${reach.guestPushSent} to guest devices · ${reach.pushFailed} failed`}>
              {reach.pushPending ? <span className="text-xs font-medium text-slate-500">sending…</span> : <>{reach.pushSent.toLocaleString()}{reach.pushFailed ? <span className="text-xs font-medium text-red-600"> / {reach.pushFailed} failed</span> : null}</>}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="flex shrink-0 flex-wrap gap-1.5 lg:w-44 lg:justify-end">
        {['draft', 'scheduled', 'active'].includes(phase) ? <AdminButton size="sm" variant="secondary" icon="edit" onClick={onEdit}>Edit</AdminButton> : null}
        {['draft', 'scheduled'].includes(phase) ? <AdminButton size="sm" variant="primary" onClick={onSendNow}>Send now</AdminButton> : null}
        {phase === 'active' ? <AdminButton size="sm" variant="success" onClick={onAllClear}>All clear</AdminButton> : null}
        {['scheduled', 'active'].includes(phase) ? <AdminButton size="sm" variant="outline-danger" onClick={onCancel}>{phase === 'active' ? 'Withdraw' : 'Cancel'}</AdminButton> : null}
        {phase === 'draft' ? <AdminButton size="sm" variant="outline-danger" icon="delete" onClick={onDelete}>Delete</AdminButton> : null}
      </div>
    </li>
  )
}

function Field({ label, htmlFor, hint, children, counter }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">{label}</label>
        {counter ? <span className="text-xs tabular-nums text-slate-400">{counter}</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'

function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="alert-modal-title" className={`flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="alert-modal-title" className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  )
}

function AlertComposer({ composer, categories, templates, onClose, onSaved, onTemplateSaved, onError }) {
  const [form, setForm] = useState(composer.form)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const isSent = composer.mode === 'edit' && composer.alert.status === 'sent'
  const set = (patch) => { setConfirming(false); setForm((current) => ({ ...current, ...patch })) }

  const applyTemplate = (id) => {
    const template = templates.find((item) => item.id === id)
    if (!template) return set({ template_id: '' })
    set({ template_id: id, title: template.title, message: template.message, category: template.category, severity: template.severity, affected_area: template.affected_area || '', audience: template.severity === 'critical' ? 'all' : form.audience })
  }

  const setExpiryIn = (hours) => {
    const base = form.delivery === 'schedule' && form.scheduled_for ? new Date(form.scheduled_for) : new Date()
    set({ expires_at: toLocalInput(new Date(base.getTime() + hours * 3_600_000)) })
  }

  const hasPlaceholders = /\[[^\]]+\]/.test(`${form.title} ${form.message}`)

  const submit = async () => {
    if (form.delivery === 'now' && !isSent && !confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        scheduled_for: form.delivery === 'schedule' ? fromLocalInput(form.scheduled_for) : null,
        expires_at: fromLocalInput(form.expires_at),
        template_id: form.template_id || null,
      }
      const result = composer.mode === 'edit'
        ? await api(`/info/api/admin/alerts/${composer.alert.id}`, 'PUT', payload)
        : await api('/info/api/admin/alerts', 'POST', payload)
      await onSaved(result.message)
    } catch (error) {
      onError(error.message)
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  const saveAsTemplate = async () => {
    const name = window.prompt('Template name', form.title.slice(0, 60))
    if (!name) return
    try {
      await api('/info/api/admin/alerts/templates', 'POST', { ...form, name })
      await onTemplateSaved()
    } catch (error) {
      onError(error.message)
    }
  }

  const severity = getSeverity(form.severity)
  const submitLabel = isSent ? 'Save changes'
    : form.delivery === 'draft' ? 'Save draft'
      : form.delivery === 'schedule' ? 'Schedule alert'
        : confirming ? `Confirm: send to ${form.audience === 'all' ? 'everyone' : 'subscribers'}` : 'Send now'

  return (
    <Modal
      wide
      title={composer.mode === 'edit' ? 'Edit alert' : 'New alert'}
      onClose={onClose}
      footer={(
        <>
          {!isSent ? <AdminButton variant="ghost" onClick={saveAsTemplate} disabled={saving}>Save as template</AdminButton> : null}
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancel</AdminButton>
          <AdminButton variant={confirming || form.severity === 'critical' ? 'danger' : 'primary'} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </AdminButton>
        </>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          {isSent ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This alert has already been sent. You can correct the wording and area; the public page shows it as updated, and people are not notified again. To announce a change, send a new alert.
            </p>
          ) : null}

          {!isSent && templates.length ? (
            <Field label="Start from a template" htmlFor="alert-template">
              <select id="alert-template" value={form.template_id} onChange={(event) => applyTemplate(event.target.value)} className={inputClass}>
                <option value="">Blank alert</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </Field>
          ) : null}

          <Field label="Title *" htmlFor="alert-title" counter={`${form.title.length}/${ALERT_LIMITS.title}`}>
            <input id="alert-title" value={form.title} maxLength={ALERT_LIMITS.title} onChange={(event) => set({ title: event.target.value })} className={inputClass} placeholder="e.g., Heavy rain warning for Daet" />
          </Field>

          <Field label="Message *" htmlFor="alert-message" counter={`${form.message.length}/${ALERT_LIMITS.message}`} hint="Say what is happening, where, and what people should do. The first 240 characters appear in the push notification.">
            <textarea id="alert-message" rows={5} value={form.message} maxLength={ALERT_LIMITS.message} onChange={(event) => set({ message: event.target.value })} className={`${inputClass} resize-y`} />
          </Field>

          {hasPlaceholders ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              The text still has [placeholders] from the template. Replace them before sending.
            </p>
          ) : null}

          {!isSent ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category *" htmlFor="alert-category">
                  <select id="alert-category" value={form.category} onChange={(event) => set({ category: event.target.value })} className={inputClass}>
                    {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                  </select>
                </Field>
                <Field label="Send to" htmlFor="alert-audience" hint={ALERT_AUDIENCES.find((item) => item.value === form.audience)?.hint}>
                  <select id="alert-audience" value={form.audience} onChange={(event) => set({ audience: event.target.value })} className={inputClass}>
                    {ALERT_AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-gray-700">Severity *</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ALERT_SEVERITIES.map((item) => (
                    <label key={item.value} className={`cursor-pointer rounded-xl border p-2.5 text-xs ${form.severity === item.value ? SEVERITY_STYLES[item.value] + ' ring-2 ring-offset-1 ring-current' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input type="radio" name="alert-severity" value={item.value} checked={form.severity === item.value} onChange={() => set({ severity: item.value, ...(item.value === 'critical' ? { audience: 'all' } : {}) })} className="sr-only" />
                      <span className="block font-bold">{item.label}</span>
                      <span className="mt-0.5 block leading-4 opacity-80">{item.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          <Field label="Affected area" htmlFor="alert-area" hint="Optional. Leave blank for all of Daet.">
            <input id="alert-area" value={form.affected_area} maxLength={ALERT_LIMITS.area} onChange={(event) => set({ affected_area: event.target.value })} className={inputClass} placeholder="e.g., Bagasbas Beach and coastal barangays" />
          </Field>

          <details className="rounded-xl border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Barangays ({form.barangays.length || 'all'})</summary>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {DAET_BARANGAYS.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.barangays.includes(name)}
                    onChange={(event) => set({ barangays: event.target.checked ? [...form.barangays, name] : form.barangays.filter((item) => item !== name) })}
                    className="h-4 w-4 accent-blue-600"
                  />
                  {name}
                </label>
              ))}
            </div>
          </details>

          {!isSent ? (
            <>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-gray-700">When</legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'now', label: 'Send now', icon: Send },
                    { value: 'schedule', label: 'Schedule', icon: Clock },
                    { value: 'draft', label: 'Save as draft', icon: FileText },
                  ].map(({ value, label, icon: Icon }) => (
                    <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium ${form.delivery === value ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input type="radio" name="alert-delivery" value={value} checked={form.delivery === value} onChange={() => set({ delivery: value })} className="sr-only" />
                      <Icon className="h-4 w-4" aria-hidden="true" />{label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {form.delivery === 'schedule' ? (
                <Field label="Send at *" htmlFor="alert-scheduled">
                  <input id="alert-scheduled" type="datetime-local" value={form.scheduled_for} onChange={(event) => set({ scheduled_for: event.target.value })} className={inputClass} />
                </Field>
              ) : null}
            </>
          ) : null}

          <Field label="Ends (optional)" htmlFor="alert-expires" hint="After this time the alert moves to history automatically. You can also mark it all clear at any time.">
            <div className="flex flex-wrap gap-2">
              <input id="alert-expires" type="datetime-local" value={form.expires_at} onChange={(event) => set({ expires_at: event.target.value })} className={`${inputClass} sm:w-auto`} />
              {[6, 24, 72].map((hours) => (
                <button key={hours} type="button" onClick={() => setExpiryIn(hours)} className="rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">+{hours < 24 ? `${hours}h` : `${hours / 24}d`}</button>
              ))}
              {form.expires_at ? <button type="button" onClick={() => set({ expires_at: '' })} className="px-1 text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button> : null}
            </div>
          </Field>
        </div>

        <aside aria-label="Notification preview" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone preview</p>
          <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-inner">
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              <BellRing className="h-3.5 w-3.5" aria-hidden="true" />CONNECT-Daet · now
            </div>
            <p className="mt-1 text-sm font-semibold leading-5">
              {{ critical: 'EMERGENCY: ', warning: 'Warning: ', advisory: 'Advisory: ' }[form.severity] || ''}{form.title || 'Alert title'}
            </p>
            <p className="mt-0.5 line-clamp-4 text-xs leading-4 text-white/80">{(form.message || 'Your message appears here.').slice(0, 240)}</p>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            <strong className="text-slate-700">{severity.label}:</strong> {severity.hint}.
            {['warning', 'critical'].includes(form.severity) ? ' Also shown as a banner across the website while active.' : ''}
          </p>
          {confirming ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              Check the text once more. Push notifications cannot be recalled once sent.
            </p>
          ) : null}
        </aside>
      </div>
    </Modal>
  )
}

function ActionDialog({ dialog, onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const isAllClear = dialog.type === 'all_clear'
  const isWithdraw = dialog.type === 'cancel' && dialog.alert.status === 'sent'

  const confirm = async () => {
    setBusy(true)
    await onConfirm(isAllClear ? { message: text } : { reason: text })
    setBusy(false)
  }

  return (
    <Modal
      title={isAllClear ? 'Mark all clear' : isWithdraw ? 'Withdraw alert' : 'Cancel scheduled alert'}
      onClose={onClose}
      footer={(
        <>
          <AdminButton variant="secondary" onClick={onClose} disabled={busy}>Back</AdminButton>
          <AdminButton variant={isAllClear ? 'success' : 'danger'} onClick={confirm} disabled={busy || (isWithdraw && text.trim().length < 3)}>
            {busy ? 'Working…' : isAllClear ? 'Send all clear' : isWithdraw ? 'Withdraw' : 'Cancel alert'}
          </AdminButton>
        </>
      )}
    >
      <p className="text-sm font-semibold text-slate-900">{dialog.alert.title}</p>
      <p className="mt-2 text-sm text-slate-600">
        {isAllClear
          ? 'Everyone who received this alert gets an "All clear" notification, and it moves to history.'
          : isWithdraw
            ? 'Use this when an alert was sent by mistake. It is removed from the current list, and its public page shows your reason. People are not notified again.'
            : 'The alert will not be sent.'}
      </p>
      {isAllClear || isWithdraw ? (
        <div className="mt-4">
          <Field label={isAllClear ? 'All-clear message' : 'Reason (shown publicly) *'} htmlFor="alert-action-text">
            <textarea
              id="alert-action-text"
              rows={3}
              value={text}
              maxLength={isAllClear ? ALERT_LIMITS.allClear : 300}
              onChange={(event) => setText(event.target.value)}
              className={`${inputClass} resize-y`}
              placeholder={isAllClear ? 'The situation has returned to normal.' : 'Sent in error; the road remains open.'}
            />
          </Field>
        </div>
      ) : null}
    </Modal>
  )
}

function TemplateList({ templates, categoryName, onUse, onEdit, onDelete, onCreate }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Templates fill in the form so common alerts go out fast and worded consistently.</p>
        <AdminButton size="sm" variant="secondary" icon="plus" onClick={onCreate}>New template</AdminButton>
      </div>
      {templates.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-col rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={template.severity} />
                <span className="text-xs font-semibold text-slate-500">{categoryName(template.category)}</span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-slate-900">{template.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{template.message}</p>
              <div className="mt-3 flex gap-1.5">
                <AdminButton size="sm" variant="primary" onClick={() => onUse(template)}><Megaphone className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Use</AdminButton>
                <button type="button" onClick={() => onEdit(template)} aria-label={`Edit template ${template.name}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => onDelete(template)} aria-label={`Delete template ${template.name}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <AdminEmptyState icon="content" title="No templates yet" />
      )}
    </div>
  )
}

function TemplateEditor({ editor, categories, onClose, onSaved, onError }) {
  const [form, setForm] = useState(editor.form)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  const save = async () => {
    setSaving(true)
    try {
      if (editor.template) await api(`/info/api/admin/alerts/templates/${editor.template.id}`, 'PUT', form)
      else await api('/info/api/admin/alerts/templates', 'POST', form)
      await onSaved()
    } catch (error) {
      onError(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editor.template ? 'Edit template' : 'New template'}
      onClose={onClose}
      footer={(
        <>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancel</AdminButton>
          <AdminButton variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</AdminButton>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="Template name *" htmlFor="template-name">
          <input id="template-name" value={form.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="template-category">
            <select id="template-category" value={form.category} onChange={(event) => set({ category: event.target.value })} className={inputClass}>
              {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Severity" htmlFor="template-severity">
            <select id="template-severity" value={form.severity} onChange={(event) => set({ severity: event.target.value })} className={inputClass}>
              {ALERT_SEVERITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Title *" htmlFor="template-title" hint="Use [brackets] for parts to fill in each time.">
          <input id="template-title" value={form.title} maxLength={ALERT_LIMITS.title} onChange={(event) => set({ title: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Message *" htmlFor="template-message">
          <textarea id="template-message" rows={5} value={form.message} maxLength={ALERT_LIMITS.message} onChange={(event) => set({ message: event.target.value })} className={`${inputClass} resize-y`} />
        </Field>
        <Field label="Affected area" htmlFor="template-area">
          <input id="template-area" value={form.affected_area || ''} maxLength={ALERT_LIMITS.area} onChange={(event) => set({ affected_area: event.target.value })} className={inputClass} />
        </Field>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Templates are never sent on their own.</p>
      </div>
    </Modal>
  )
}
