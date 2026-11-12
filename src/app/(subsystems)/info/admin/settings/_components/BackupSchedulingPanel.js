'use client'

import { useEffect, useState } from 'react'

const BACKUPS_API = '/info/api/admin/data-management/backups'

async function readJsonResponse(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`)
  }
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function BackupSchedulingPanel({ showToast }) {
  const [settings, setSettings] = useState(null)
  const [schedule, setSchedule] = useState('')
  const [nextRunAt, setNextRunAt] = useState(null)
  const [runs, setRuns] = useState([])
  const [storageReady, setStorageReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [downloadRunId, setDownloadRunId] = useState(null)
  const [error, setError] = useState('')

  const loadBackups = async () => {
    const response = await fetch(BACKUPS_API, { cache: 'no-store' })
    const data = await readJsonResponse(response)
    if (!response.ok || !data.success) {
      throw new Error(data.message || `Unable to load backup settings (${response.status}).`)
    }

    setSettings(data.settings)
    setSchedule(data.schedule)
    setNextRunAt(data.nextRunAt)
    setRuns(data.runs || [])
    setStorageReady(data.storageReady)
    setError('')
  }

  useEffect(() => {
    let active = true
    fetch(BACKUPS_API, { cache: 'no-store' })
      .then(readJsonResponse)
      .then((data) => {
        if (!data.success) throw new Error(data.message || 'Unable to load backup settings.')
        if (!active) return
        setSettings(data.settings)
        setSchedule(data.schedule)
        setNextRunAt(data.nextRunAt)
        setRuns(data.runs || [])
        setStorageReady(data.storageReady)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load backup settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const response = await fetch(BACKUPS_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await readJsonResponse(response)
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Unable to save backup settings (${response.status}).`)
      }
      setSettings(data.settings)
      showToast('Backup settings saved.')
    } catch (saveError) {
      showToast(saveError.message || 'Unable to save backup settings.', true)
    } finally {
      setSaving(false)
    }
  }

  const runBackup = async () => {
    setRunning(true)
    try {
      const response = await fetch(BACKUPS_API, { method: 'POST' })
      const data = await readJsonResponse(response)
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Unable to create backup (${response.status}).`)
      }
      await loadBackups()
      showToast(data.retentionWarning || 'Backup completed and stored privately.')
    } catch (runError) {
      showToast(runError.message || 'Unable to create backup.', true)
      try {
        await loadBackups()
      } catch (refreshError) {
        setError(refreshError.message || 'Unable to refresh backup history.')
      }
    } finally {
      setRunning(false)
    }
  }

  const downloadDatabaseSnapshot = async (runId) => {
    setDownloadRunId(runId)
    try {
      const response = await fetch(`${BACKUPS_API}?download=${encodeURIComponent(runId)}`, { cache: 'no-store' })
      if (!response.ok) {
        const data = await readJsonResponse(response)
        throw new Error(data.message || `Unable to download snapshot (${response.status}).`)
      }

      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `connect-daet-backup-${runId}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (downloadError) {
      showToast(downloadError.message || 'Unable to download the database snapshot.', true)
    } finally {
      setDownloadRunId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-800">Backup scheduling</h2>
        <p className="mt-1 text-sm text-slate-600">
          Automatically save application-data snapshots and selected media to a private Supabase Storage bucket.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !storageReady && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
          The private backup bucket is unavailable or is not private. Apply migration 095 and verify the bucket settings before running backups.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
          <p className="mt-1 font-semibold text-slate-800">{loading ? 'Loading…' : schedule || 'Unavailable'}</p>
          <p className="mt-1 text-xs text-slate-500">Next run: {formatDate(nextRunAt)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
          <p className="mt-1 font-semibold text-slate-800">Private Supabase Storage</p>
          <p className="mt-1 text-xs text-slate-500">Bucket: admin-backups</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings?.enabled ?? false}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            disabled={loading || saving || !settings}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="block font-semibold text-slate-800">Enable scheduled backups</span>
            <span className="text-slate-500">Snapshots run Sunday at 01:00 UTC; retention cleanup runs daily.</span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Retain backups for
            <span className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="365"
                step="1"
                value={settings?.retentionDays ?? ''}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  retentionDays: event.target.value === '' ? '' : Number(event.target.value),
                }))}
                disabled={loading || saving || !settings}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
              <span className="text-sm font-normal text-slate-500">days (1–365)</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings?.includeMedia ?? false}
              onChange={(event) => setSettings((current) => ({ ...current, includeMedia: event.target.checked }))}
              disabled={loading || saving || !settings}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="block font-semibold text-slate-800">Include media files</span>
              <span className="text-slate-500">Copies media from the application storage buckets.</span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={loading || saving || !settings || !storageReady}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save backup settings'}
          </button>
          <button
            type="button"
            onClick={runBackup}
            disabled={loading || running || !storageReady}
            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Creating backup…' : 'Run backup now'}
          </button>
        </div>
      </div>

      <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        These application snapshots include supported database tables and, when enabled, media from app storage. The downloadable JSON contains database tables only; media objects are archived separately with a manifest. Snapshots exclude authentication records, password hashes, password-reset data, and push credentials; they are not a full PostgreSQL backup. Retention is enforced daily, so expired files may remain for up to another day. Supabase Storage is in the same project, so configure provider-managed backups separately for project-level disaster recovery. Media volume affects runtime and storage costs.
      </p>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Recent backup runs</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Loading backup history…</p>
        ) : runs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No backup runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Started</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Media</th>
                  <th scope="col" className="px-4 py-3">Size</th>
                  <th scope="col" className="px-4 py-3">Snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(run.started_at)}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{run.trigger_type}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        run.status === 'succeeded'
                          ? 'bg-emerald-100 text-emerald-800'
                          : run.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}>
                        {run.status}
                      </span>
                      {run.error_message && <p className="mt-1 max-w-xs text-xs text-amber-800">{run.error_message}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{run.media_object_count || 0} files</td>
                    <td className="px-4 py-3 text-slate-600">{formatBytes(run.total_bytes)}</td>
                    <td className="px-4 py-3">
                      {run.status === 'succeeded' ? (
                        <button
                          type="button"
                          onClick={() => downloadDatabaseSnapshot(run.id)}
                          disabled={Boolean(downloadRunId)}
                          className="whitespace-nowrap font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
                        >
                          {downloadRunId === run.id ? 'Downloading…' : 'Download JSON'}
                        </button>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
