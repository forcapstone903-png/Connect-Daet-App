'use client'

import { useCallback, useEffect, useState } from 'react'

function emptyGroup() {
  return { items: [], page: 0, total: 0, hasMore: false, loading: true, error: '' }
}

function initialGroups(contentType) {
  return contentType === 'forum_thread'
    ? { comments: emptyGroup(), replies: emptyGroup() }
    : { comments: emptyGroup() }
}

function formatDate(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

export default function AdminDiscussionModeration({ contentType, contentId }) {
  const [groups, setGroups] = useState(() => initialGroups(contentType))
  const [busyAction, setBusyAction] = useState('')
  const [actionError, setActionError] = useState('')
  const [muteTarget, setMuteTarget] = useState(null)
  const [muteReason, setMuteReason] = useState('')
  const [durationDays, setDurationDays] = useState('')

  const loadPage = useCallback(async (kind, page, append = false, signal) => {
    setGroups((current) => ({
      ...current,
      [kind]: { ...current[kind], loading: true, error: '' },
    }))

    try {
      const params = new URLSearchParams({
        contentType,
        contentId,
        kind,
        page: String(page),
      })
      const response = await fetch(`/info/api/admin/moderation/comments?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load discussion comments.')
      }

      setGroups((current) => {
        const previous = current[kind] || emptyGroup()
        return {
          ...current,
          [kind]: {
            items: append ? [...previous.items, ...(result.items || [])] : result.items || [],
            page: result.pagination?.page ?? page,
            total: result.pagination?.total ?? 0,
            hasMore: Boolean(result.pagination?.hasMore),
            loading: false,
            error: '',
          },
        }
      })
    } catch (error) {
      if (signal?.aborted) return
      setGroups((current) => ({
        ...current,
        [kind]: { ...current[kind], loading: false, error: error.message || 'Unable to load discussion comments.' },
      }))
    }
  }, [contentId, contentType])

  useEffect(() => {
    const controller = new AbortController()
    const kinds = contentType === 'forum_thread' ? ['comments', 'replies'] : ['comments']
    setGroups(initialGroups(contentType))
    for (const kind of kinds) void loadPage(kind, 0, false, controller.signal)
    return () => controller.abort()
  }, [contentType, contentId, loadPage])

  const reload = () => {
    const kinds = contentType === 'forum_thread' ? ['comments', 'replies'] : ['comments']
    for (const kind of kinds) void loadPage(kind, 0)
  }

  const deleteComment = async (item) => {
    const message = item.parentId
      ? 'Delete this comment and any replies attached to it?'
      : 'Delete this comment?'
    if (!window.confirm(message)) return

    setBusyAction(`delete:${item.id}`)
    setActionError('')
    try {
      const response = await fetch('/info/api/admin/moderation/comments', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType,
          contentId,
          source: item.source,
          commentId: item.id,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to delete this comment.')
      }
      if (result.notificationWarning) setActionError(result.notificationWarning)
      reload()
    } catch (error) {
      setActionError(error.message || 'Unable to delete this comment.')
    } finally {
      setBusyAction('')
    }
  }

  const toggleMute = async (userId, action, reason = '', days = '') => {
    setBusyAction(`${action}:${userId}`)
    setActionError('')
    try {
      const response = await fetch('/info/api/admin/moderation/comments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userId,
          reason,
          durationDays: days,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Unable to ${action} this user's comments.`)
      }
      setMuteTarget(null)
      setMuteReason('')
      setDurationDays('')
      reload()
    } catch (error) {
      setActionError(error.message || `Unable to ${action} this user's comments.`)
    } finally {
      setBusyAction('')
    }
  }

  const renderGroup = (kind, title) => {
    const group = groups[kind]
    if (!group) return null

    return (
      <section key={kind} className="mt-5 border-t border-slate-200 pt-4" aria-label={title}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-slate-900">{title} <span className="text-slate-500">({group.total})</span></h4>
        </div>
        {group.error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p role="alert">{group.error}</p>
            <button type="button" onClick={() => void loadPage(kind, 0)} className="mt-2 font-semibold underline">Retry</button>
          </div>
        ) : null}
        {group.loading && !group.items.length ? (
          <p className="mt-3 text-sm text-slate-500">Loading {title.toLowerCase()}…</p>
        ) : !group.items.length && !group.error ? (
          <p className="mt-3 text-sm text-slate-500">No {title.toLowerCase()} yet.</p>
        ) : (
          <ol className="mt-3 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {group.items.map((item) => {
              const authorName = item.author?.full_name || item.author?.email || 'Community member'
              const isStaff = ['admin', 'administrator', 'tourism_officer', 'moderator']
                .includes(String(item.author?.user_type || '').trim().toLowerCase())
              return (
                <li key={`${item.source}:${item.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-900">
                        {authorName}
                        {item.muted ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title={item.muteReason || 'This user is muted from commenting'}>Muted</span> : null}
                      </p>
                      {item.author?.email ? <p className="text-xs text-slate-500">{item.author.email}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold capitalize text-slate-600">{String(item.status || 'active').replace(/[_-]/g, ' ')}</span>
                      <time className="text-[11px] text-slate-500">{formatDate(item.createdAt)}</time>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.content || 'No text content.'}</p>
                  {item.parentId ? <p className="mt-1 text-[11px] text-slate-400">Reply to another comment</p> : null}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {!isStaff ? (
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        onClick={() => {
                          if (item.muted) {
                            void toggleMute(item.userId, 'unmute')
                            return
                          }
                          setMuteTarget({ userId: item.userId, authorName })
                          setMuteReason('')
                          setDurationDays('')
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${item.muted ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-amber-200 text-amber-800 hover:bg-amber-50'}`}
                      >
                        {item.muted ? 'Restore commenting' : 'Mute from commenting'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void deleteComment(item)}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busyAction === `delete:${item.id}` ? 'Deleting…' : 'Delete comment'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {group.hasMore ? (
          <button
            type="button"
            disabled={group.loading}
            onClick={() => void loadPage(kind, group.page + 1, true)}
            className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {group.loading ? 'Loading…' : `Load more ${title.toLowerCase()}`}
          </button>
        ) : null}
      </section>
    )
  }

  const submitMute = (event) => {
    event.preventDefault()
    if (muteTarget) void toggleMute(muteTarget.userId, 'mute', muteReason, durationDays)
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Discussion</p>
        <h3 className="mt-1 text-base font-bold text-slate-900">
          {contentType === 'blog' ? 'Post comments' : 'Thread discussion'}
        </h3>
      </div>
      {actionError ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
      {renderGroup('comments', 'Comments')}
      {contentType === 'forum_thread' ? renderGroup('replies', 'Forum replies') : null}

      {muteTarget ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <form onSubmit={submitMute} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="mute-commenting-title">
            <h3 id="mute-commenting-title" className="text-lg font-bold text-slate-950">Mute {muteTarget.authorName} from commenting?</h3>
            <p className="mt-1 text-sm text-slate-600">They will be unable to add comments or forum replies until the mute expires or a moderator restores access.</p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Reason
              <textarea required maxLength={1000} rows={3} value={muteReason} onChange={(event) => setMuteReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal" />
            </label>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Duration in days (blank = until restored)
              <input type="number" min="1" max="365" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" />
            </label>
            {actionError ? <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={Boolean(busyAction)} onClick={() => setMuteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={Boolean(busyAction)} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyAction.startsWith('mute:') ? 'Applying…' : 'Mute commenting'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
