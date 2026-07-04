'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Award, CheckCircle2, Gift, MessageSquareShare, Sparkles, TrendingUp } from 'lucide-react'

const perks = [
  {
    id: 'beach-guide',
    title: 'Beach Guide Pack',
    description: 'Unlock a curated mini-guide for Daet beaches and sunset spots.',
    pointsRequired: 100,
    accent: 'from-teal-500 to-blue-600',
  },
  {
    id: 'festival-pass',
    title: 'Festival Priority Pass',
    description: 'Get early access to local festival updates and event perks.',
    pointsRequired: 250,
    accent: 'from-amber-500 to-orange-500',
  },
  {
    id: 'local-host',
    title: 'Local Host Welcome',
    description: 'Claim a community welcome perk for your next visit to Daet.',
    pointsRequired: 500,
    accent: 'from-purple-500 to-pink-500',
  },
]

const badgeLevels = [
  { id: 'explorer', label: 'Explorer', points: 0, description: 'Welcome badge for first-time travelers.' },
  { id: 'adventurer', label: 'Adventurer', points: 100, description: 'Unlocked after posting and sharing your first experience.' },
  { id: 'curator', label: 'Curator', points: 300, description: 'Earned by staying active and joining the community.' },
  { id: 'local-legend', label: 'Local Legend', points: 600, description: 'A top-level badge for long-time Daet explorers.' },
]

export default function RewardsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [redeemingId, setRedeemingId] = useState(null)
  const [notice, setNotice] = useState('')
  const [selectedPerk, setSelectedPerk] = useState(null)
  const [isClaiming, setIsClaiming] = useState(false)

  useEffect(() => {
    const loadRewards = async () => {
      const sessionData = sessionStorage.getItem('user_session')
      if (!sessionData) {
        router.push('/login')
        return
      }

      const parsedSession = JSON.parse(sessionData)
      const { data: userProfile } = await supabase
        .from('info_users')
        .select('id, full_name, points, user_type, profile_image_url')
        .eq('id', parsedSession.user_id)
        .single()

      if (userProfile) {
        setProfile(userProfile)
      }

      const { data: rewardHistory } = await supabase
        .from('reward_history')
        .select('*')
        .eq('user_id', parsedSession.user_id)
        .order('created_at', { ascending: false })
        .limit(15)

      setActivities(rewardHistory || [])
      setLoading(false)
    }

    loadRewards()
  }, [router])

  const pointBalance = profile?.points || 0

  const badges = useMemo(() => {
    return badgeLevels.map((badge, index) => {
      const unlocked = pointBalance >= badge.points
      const previous = badgeLevels[index - 1]?.points || 0
      const progress = unlocked
        ? 100
        : pointBalance > previous
          ? Math.min(100, Math.round(((pointBalance - previous) / (badge.points - previous)) * 100))
          : 0

      return { ...badge, unlocked, progress }
    })
  }, [pointBalance])

  const nextBadge = badges.find((badge) => !badge.unlocked) || badges[badges.length - 1]
  const unlockedBadges = badges.filter((badge) => badge.unlocked)

  const redeemPerk = async (perk) => {
    if (!profile?.id) return

    if ((profile?.points || 0) < perk.pointsRequired) {
      setNotice(`You need ${perk.pointsRequired} points to claim this perk.`)
      return
    }

    setIsClaiming(true)
    setRedeemingId(perk.id)

    const nextPoints = (profile.points || 0) - perk.pointsRequired
    const { error } = await supabase.from('info_users').update({
      points: nextPoints,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id)

    if (!error) {
      await supabase.from('reward_history').insert({
        user_id: profile.id,
        subsystem_source: `perk_${perk.id}`,
        points_earned: -perk.pointsRequired,
        description: `Redeemed ${perk.title}`,
      })

      setProfile((prev) => prev ? { ...prev, points: nextPoints } : prev)
      setNotice(`You redeemed ${perk.title}.`)
      const { data: rewardHistory } = await supabase
        .from('reward_history')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(15)
      setActivities(rewardHistory || [])
    }

    setRedeemingId(null)
    setIsClaiming(false)
    setSelectedPerk(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="rounded-2xl bg-white px-8 py-6 shadow-sm">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-sm text-slate-600">Loading your rewards center...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-6">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
            <ArrowLeft size={16} /> Back to dashboard
          </button>
          <div className="text-right">
            <p className="text-lg font-semibold text-slate-900">Daet Rewards</p>
            <p className="text-sm text-slate-500">Claim perks and unlock badges</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-6">
        {notice && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
            {notice}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-teal-600 to-blue-700 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-teal-100">Your traveler progress</p>
              <h1 className="text-2xl font-semibold">{profile?.full_name || 'Traveler'} is leveling up in Daet</h1>
              <p className="mt-2 max-w-2xl text-sm text-teal-50">Post, share, and explore to unlock new badges and redeem perks crafted for your next trip.</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm backdrop-blur">
              <p className="text-teal-100">Current points</p>
              <p className="text-2xl font-semibold">{pointBalance}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Badge unlocks</h2>
                <p className="text-sm text-slate-500">Your progress toward the next milestone.</p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                Next: {nextBadge?.label}
              </div>
            </div>

            <div className="space-y-4">
              {badges.map((badge) => (
                <div key={badge.id} className={`rounded-2xl border p-4 transition-all ${badge.unlocked ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award size={16} className={badge.unlocked ? 'text-amber-500' : 'text-slate-400'} />
                      <span className="font-semibold text-slate-900">{badge.label}</span>
                    </div>
                    {badge.unlocked ? (
                      <span className="flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle2 size={15} /> Unlocked</span>
                    ) : (
                      <span className="text-sm text-slate-500">{badge.points} pts</span>
                    )}
                  </div>
                  <p className="mb-3 text-sm text-slate-600">{badge.description}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-600 transition-all duration-500" style={{ width: `${badge.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-teal-500" />
              <h2 className="text-lg font-semibold text-slate-900">Redeemable perks</h2>
            </div>
            <div className="space-y-3">
              {perks.map((perk) => {
                const claimed = (profile?.points || 0) < perk.pointsRequired
                return (
                  <div key={perk.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className={`mb-3 h-12 rounded-2xl bg-gradient-to-r ${perk.accent}`} />
                    <h3 className="font-semibold text-slate-900">{perk.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{perk.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{perk.pointsRequired} pts</span>
                      <button
                        onClick={() => setSelectedPerk(perk)}
                        disabled={redeemingId === perk.id || claimed}
                        className="rounded-full bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {redeemingId === perk.id ? 'Claiming...' : claimed ? 'Not enough points' : 'Claim perk'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-500" />
              <h2 className="text-lg font-semibold text-slate-900">Recent reward activity</h2>
            </div>
            <div className="space-y-3">
              {activities.length > 0 ? activities.map((activity) => (
                <div key={activity.id} className="flex items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{activity.description || 'Reward activity'}</p>
                    <p className="text-sm text-slate-500">{new Date(activity.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-sm font-semibold ${Number(activity.points_earned) >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {Number(activity.points_earned) >= 0 ? '+' : ''}{activity.points_earned} pts
                  </span>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Your activity feed is empty. Start sharing your Daet moments to build momentum.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareShare size={18} className="text-teal-500" />
              <h2 className="text-lg font-semibold text-slate-900">Shared activity</h2>
            </div>
            <div className="space-y-3">
              {activities.filter((item) => item.subsystem_source === 'post_shared' || item.description?.includes('shared')).length > 0 ? activities.filter((item) => item.subsystem_source === 'post_shared' || item.description?.includes('shared')).map((item) => (
                <div key={item.id} className="rounded-2xl border border-teal-200 bg-teal-50 p-3">
                  <div className="flex items-center gap-2">
                    <MessageSquareShare size={15} className="text-teal-600" />
                    <p className="font-medium text-slate-900">{item.description || 'Shared a travel moment'}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Sharing a post will appear here as soon as it is recorded.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {selectedPerk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-teal-600">Confirm reward</p>
                <h3 className="text-lg font-semibold text-slate-900">{selectedPerk.title}</h3>
              </div>
              <button onClick={() => setSelectedPerk(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <p className="text-sm text-slate-600">{selectedPerk.description}</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
              This will redeem {selectedPerk.pointsRequired} points from your current balance.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSelectedPerk(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={() => redeemPerk(selectedPerk)} className="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                {isClaiming ? 'Claiming...' : 'Confirm claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
