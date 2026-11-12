'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock3, MessageCircle, RefreshCw, Users } from 'lucide-react'
import { AdminButton, AdminPanel, AdminShell } from '@/app/(subsystems)/info/components/admin'
import { getStaffRoleLabel } from '@/lib/staffRoles.mjs'
import styles from './page.module.css'

const MAX_MESSAGE_LENGTH = 2000
const REFRESH_INTERVAL_MS = 15_000

async function fetchStaffChat() {
  const response = await fetch('/info/api/admin/staff-chat', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Unable to load staff chat.')
  }
  return result
}

function formatTimestamp(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function StaffChatPage() {
  const [messages, setMessages] = useState([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const scrollContainerRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const requestInProgressRef = useRef(false)

  const refresh = useCallback(async (quiet = false) => {
    if (requestInProgressRef.current) return
    requestInProgressRef.current = true
    if (!quiet) setLoading(true)

    try {
      const result = await fetchStaffChat()
      setMessages(result.messages || [])
      setCurrentUserId(result.currentUserId || '')
      setError('')
    } catch (loadError) {
      console.error('Staff chat load failed:', loadError)
      setError(loadError.message || 'Unable to load staff chat.')
    } finally {
      requestInProgressRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => refresh(), 0)
    const intervalId = window.setInterval(() => refresh(true), REFRESH_INTERVAL_MS)
    return () => {
      window.clearTimeout(initialRefreshId)
      window.clearInterval(intervalId)
    }
  }, [refresh])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (container && stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  const sendMessage = async (event) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/info/api/admin/staff-chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to send your message.')
      }

      setMessages((current) => [...current, result.message].slice(-100))
      setDraft('')
      setNotice(result.notificationWarning || 'Message sent to the staff team.')
      stickToBottomRef.current = true
    } catch (sendError) {
      console.error('Staff chat send failed:', sendError)
      setError(sendError.message || 'Unable to send your message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <AdminShell
      roleLabel="Staff Chat"
      eyebrow="Team Communication"
      title="Staff Chat"
      description="A private shared conversation for Admins, Tourism Officers, and Moderators."
      headerIcon="forum"
      headerClassName={styles.pageHeader}
      actions={(
        <AdminButton
          variant="secondary"
          size="sm"
          icon="refresh"
          onClick={() => refresh()}
          disabled={loading}
        >
          Refresh
        </AdminButton>
      )}
    >
      <main className={styles.content}>
        <AdminPanel
          title="Staff team"
          description="Messages are visible to active staff members only."
          className={styles.chatPanel}
          bodyClassName={styles.panelBody}
          padded={false}
        >
          <div
            ref={scrollContainerRef}
            className={styles.messageWindow}
            onScroll={(event) => {
              const { scrollTop, scrollHeight, clientHeight } = event.currentTarget
              stickToBottomRef.current = scrollHeight - scrollTop - clientHeight < 120
            }}
            aria-live="polite"
            aria-label="Staff chat messages"
          >
            {loading && messages.length === 0 ? (
              <p className={styles.emptyState}>Loading staff conversation…</p>
            ) : messages.length === 0 ? (
              <div className={styles.emptyState}>
                <MessageCircle aria-hidden="true" />
                <p>No messages yet. Start the staff conversation.</p>
              </div>
            ) : (
              <ol className={styles.messageList}>
                {messages.map((message) => {
                  const isOwnMessage = message.sender_id === currentUserId
                  const sender = message.sender || {}
                  return (
                    <li
                      key={message.id}
                      className={`${styles.messageRow} ${isOwnMessage ? styles.ownMessageRow : ''}`}
                    >
                      <article className={`${styles.messageBubble} ${isOwnMessage ? styles.ownMessageBubble : ''}`}>
                        <div className={styles.messageMeta}>
                          <span className={styles.senderName}>
                            {isOwnMessage ? 'You' : sender.full_name || 'Former staff member'}
                          </span>
                          {!isOwnMessage && sender.user_type ? (
                            <span className={styles.roleBadge}>{getStaffRoleLabel(sender.user_type)}</span>
                          ) : null}
                          <span className={styles.timestamp}>
                            <Clock3 aria-hidden="true" />
                            {formatTimestamp(message.created_at)}
                          </span>
                        </div>
                        <p className={styles.messageText}>{message.body}</p>
                      </article>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <form className={styles.composer} onSubmit={sendMessage}>
            {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}
            {notice ? <p className={styles.noticeMessage} role="status">{notice}</p> : null}
            <label className={styles.composerLabel} htmlFor="staff-chat-message">
              <Users aria-hidden="true" />
              Message the staff team
            </label>
            <textarea
              id="staff-chat-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={3}
              placeholder="Share an update or ask the team a question…"
              disabled={sending}
            />
            <div className={styles.composerFooter}>
              <span className={styles.characterCount}>
                {draft.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
              </span>
              <AdminButton
                type="submit"
                variant="primary"
                icon="send"
                disabled={sending || !draft.trim()}
              >
                {sending ? 'Sending…' : 'Send message'}
              </AdminButton>
            </div>
          </form>
        </AdminPanel>
      </main>
    </AdminShell>
  )
}
