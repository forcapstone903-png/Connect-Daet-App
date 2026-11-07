'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Ban, Check, UserRoundMinus } from 'lucide-react'
import { getStoredSession } from '@/lib/authCookies'
import UserSectionHeader, { SectionTabs } from '@/app/components/user/UserSectionHeader'
import UserTopHeader from '@/app/components/user/UserTopHeader'

function getInitials(name = '') {
  return (name || 'U').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

export default function ProfileConnectionsPage() {
  const [userId, setUserId] = useState('')
  const [activeTab, setActiveTab] = useState('followers')
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [blockedIds, setBlockedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const session = getStoredSession()
    const parsed = session ? JSON.parse(session) : null
    const id = parsed?.user_id || parsed?.id || parsed?.userId || parsed?.sub || ''
    const query = new URLSearchParams(window.location.search)
    const tab = query.get('tab')
    const profileId = query.get('user') || id
    queueMicrotask(() => {
      setUserId(id)
      if (tab === 'following') setActiveTab(tab)
    })

    if (!id) {
      queueMicrotask(() => setLoading(false))
      return
    }

    fetch(`/api/users/${profileId}`, { credentials: 'same-origin' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load connections.')
        setFollowers(result.followers || [])
        setFollowing(result.following || [])
        setBlockedIds(new Set(result.blocked_ids || []))
      })
      .catch((error) => setNotice(error.message))
      .finally(() => setLoading(false))
  }, [])

  const people = useMemo(() => (activeTab === 'followers' ? followers : following), [activeTab, followers, following])

  const unfollow = async (personId) => {
    setBusyId(personId)
    setNotice('')
    try {
      const response = await fetch(`/api/users/${personId}/follow`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to unfollow this user.')
      setFollowing((current) => current.filter((person) => person.id !== personId))
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusyId('')
    }
  }

  const toggleBlock = async (personId) => {
    const isBlocked = blockedIds.has(personId)
    setBusyId(personId)
    setNotice('')
    try {
      const response = await fetch(`/api/users/${personId}/block`, { method: isBlocked ? 'DELETE' : 'POST', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update the block setting.')
      setBlockedIds((current) => {
        const next = new Set(current)
        if (isBlocked) next.delete(personId)
        else next.add(personId)
        return next
      })
      if (!isBlocked) {
        setFollowing((current) => current.filter((person) => person.id !== personId))
        setFollowers((current) => current.filter((person) => person.id !== personId))
      }
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <main className="tourism-shell usr-section-page usr-profile min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-3xl px-3 pb-24 pt-2 sm:px-5 lg:px-6">
        <UserSectionHeader
          eyebrow="Your community"
          title="Connections"
          description="See who follows you and who you follow, and keep your feed comfortable."
          emoji="🤝"
          backHref="/user/profile"
          backLabel="Your profile"
        >
          <span className="usr-section-counter">{followers.length + following.length} people</span>
        </UserSectionHeader>

        <SectionTabs
          label="Connection lists"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'followers', label: 'Followers', count: followers.length },
            { value: 'following', label: 'Following', count: following.length },
          ]}
        />

        {notice && <p role="status" className="usr-inline-note usr-inline-note-error mb-4">{notice}</p>}

        <section className="usr-card overflow-hidden">
          <div className="p-1.5">
            {loading ? (
              <div className="usr-section-loading">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex items-center gap-4 p-4">
                    <div className="usr-section-skeleton h-11 w-11 shrink-0 rounded-full" />
                    <div className="usr-section-skeleton h-3 w-1/3 rounded-full" />
                  </div>
                ))}
              </div>
            ) : people.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-semibold text-slate-600">No {activeTab} yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeTab === 'followers'
                    ? 'Share your profile so other travelers can follow your stories.'
                    : 'Follow community members to see their stories and updates first.'}
                </p>
                <Link href="/search" className="usr-section-secondary mt-4 inline-flex">Find people</Link>
              </div>
            ) : (
              <div className="usr-stagger divide-y divide-slate-100">
                {people.map((person) => {
                  const isBlocked = blockedIds.has(person.id)
                  const isBusy = busyId === person.id
                  return (
                    <div key={person.id} className="flex min-h-[72px] items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50 sm:px-4">
                      <Link href={`/user/profile/${person.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-xs font-black text-teal-700">{person.profile_image_url ? <img src={person.profile_image_url} alt={person.full_name || 'User'} className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span>
                        <span className="min-w-0 truncate text-sm font-bold text-slate-900 group-hover:text-teal-700">{person.full_name || 'Community member'}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {activeTab === 'following' && <button type="button" disabled={isBusy} onClick={() => unfollow(person.id)} className="usr-press inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><UserRoundMinus className="h-3.5 w-3.5" /> Unfollow</button>}
                        <button type="button" disabled={isBusy} onClick={() => toggleBlock(person.id)} className={`usr-press inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${isBlocked ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>{isBlocked ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />} {isBlocked ? 'Unblock' : 'Block'}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
