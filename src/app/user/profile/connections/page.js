'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, Check, UserRoundMinus } from 'lucide-react'
import { getStoredSession } from '@/lib/authCookies'

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
    setUserId(id)
    if (tab === 'following') setActiveTab(tab)

    if (!id) {
      setLoading(false)
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
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/user/profile" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" /> Back to profile</Link>
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Your community</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Connections</h1>
            <p className="mt-1 text-sm text-slate-500">Manage who follows you and who you follow.</p>
          </div>
          <div className="grid grid-cols-2 border-b border-slate-200">
            {['followers', 'following'].map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`border-b-2 px-4 py-3 text-sm font-bold capitalize ${activeTab === tab ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {tab} <span className="ml-1 text-xs font-medium">{tab === 'followers' ? followers.length : following.length}</span>
              </button>
            ))}
          </div>
          <div className="p-4 sm:p-6">
            {notice && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{notice}</p>}
            {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading connections...</p> : people.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No {activeTab} yet.</p> : (
              <div className="space-y-2">
                {people.map((person) => {
                  const isBlocked = blockedIds.has(person.id)
                  const isBusy = busyId === person.id
                  return (
                    <div key={person.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-3">
                      <Link href={`/user/profile/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-sky-700">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-black text-sky-700">{person.profile_image_url ? <img src={person.profile_image_url} alt={person.full_name || 'User'} className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span>
                        <span className="min-w-0 truncate text-sm font-bold">{person.full_name || 'Community member'}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {activeTab === 'following' && <button type="button" disabled={isBusy} onClick={() => unfollow(person.id)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><UserRoundMinus className="h-3.5 w-3.5" /> Unfollow</button>}
                        <button type="button" disabled={isBusy} onClick={() => toggleBlock(person.id)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold disabled:opacity-50 ${isBlocked ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>{isBlocked ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />} {isBlocked ? 'Unblock' : 'Block'}</button>
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
