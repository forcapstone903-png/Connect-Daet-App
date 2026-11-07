'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Crown,
  Gift,
  Medal,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSession } from '@/lib/authCookies'
import { getDailyStreak, getLevelFromPoints, getLevelProgress, getRewardBadges } from '@/lib/gamification'
import UserTopHeader from '@/app/components/user/UserTopHeader'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'

function readStoredSession() {
  if (typeof window === 'undefined') return null

  try {
    const raw = getStoredSession()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function formatDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name) {
  return (name || 'T')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'T'
}

const rewards = [
  { title: 'Local food voucher', points: 500 },
  { title: 'Weekend attraction pass', points: 900 },
  { title: 'Community souvenir pack', points: 1400 },
]

export default function UserRewardsPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({ full_name: 'Traveler', points: 0, level: 1, avatar_url: '' })
  const [pointsHistory, setPointsHistory] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [badges, setBadges] = useState([])
  const [streakInfo, setStreakInfo] = useState({ current: 0, longest: 0 })
  const [redeeming, setRedeeming] = useState('')
  const [redeemedRewards, setRedeemedRewards] = useState([])
  const [redemptionNotice, setRedemptionNotice] = useState('')

  useEffect(() => {
    const currentSession = readStoredSession()

    const userId = currentSession?.user_id || currentSession?.id || currentSession?.userId || currentSession?.sub
    const userFullName = currentSession?.full_name || currentSession?.user_name || currentSession?.email?.split('@')[0] || 'Traveler'

    queueMicrotask(() => setProfile({
      full_name: userFullName,
      points: currentSession?.points || 0,
      level: getLevelFromPoints(currentSession?.points || 0),
      avatar_url: currentSession?.avatar_url || '',
    }))

    if (!userId) {
      queueMicrotask(() => setLoading(false))
      return
    }

    const loadRewards = async () => {
      try {
        const [{ data: userData }, { data: pointsRows }, { data: badgeRows }, { data: leaderboardRows }, { data: activityRows }] = await Promise.all([
          supabase
            .from('info_users')
            .select('id, full_name, profile_image_url, points, level, created_at')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('user_points')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('user_badges')
            .select('*')
            .eq('user_id', userId)
            .order('earned_at', { ascending: false }),
          supabase
            .from('info_users')
            .select('id, full_name, profile_image_url, points')
            .order('points', { ascending: false })
            .limit(5),
          supabase
            .from('user_activity_log')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(8),
        ])

        const nextPoints = Number(userData?.points || currentSession?.points || 0)
        const earnedBadges = getRewardBadges(nextPoints)
        const derivedBadges = (badgeRows || []).map((badge) => ({ ...badge, badge_name: badge.badge_name || badge.name || 'Badge' }))
        const allBadges = Array.from(new Map([...earnedBadges.map((badge) => [badge.name, badge]), ...derivedBadges.map((badge) => [badge.badge_name, { name: badge.badge_name, description: badge.badge_description || 'Community achievement' }])].map(([key, value]) => [key, value])) .values())

        setProfile({
          full_name: userData?.full_name || userFullName,
          points: nextPoints,
          level: getLevelFromPoints(nextPoints),
          avatar_url: userData?.profile_image_url || currentSession?.avatar_url || '',
        })
        setPointsHistory((pointsRows || []).map((entry) => ({
          id: entry.id,
          reason: entry.reason || 'Activity reward',
          points: Number(entry.points || 0),
          created_at: entry.created_at,
        })))
        setBadges(allBadges)
        setLeaderboard((leaderboardRows || []).map((entry) => ({
          id: entry.id,
          name: entry.full_name || 'Traveler',
          points: Number(entry.points || 0),
          avatar_url: entry.profile_image_url || '',
        })))
        setStreakInfo(getDailyStreak((activityRows || []).map((entry) => entry.created_at?.slice(0, 10)).filter(Boolean)))
      } catch (error) {
        console.error('Rewards load failed:', error)
      } finally {
        setLoading(false)
      }
    }

    loadRewards()
  }, [])

  const redeemReward = async (reward) => {
    if (profile.points < reward.points) {
      setRedemptionNotice(`You need ${reward.points - profile.points} more points to redeem this reward.`)
      return
    }

    setRedeeming(reward.title)
    setRedemptionNotice('')
    try {
      const response = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title: reward.title }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to redeem this reward.')
      setProfile((current) => ({ ...current, points: result.points }))
      setRedeemedRewards((current) => [...current, reward.title])
      setRedemptionNotice(result.message)
    } catch (error) {
      setRedemptionNotice(error.message)
    } finally {
      setRedeeming('')
    }
  }

  const currentLevel = useMemo(() => getLevelFromPoints(profile.points), [profile.points])
  const levelProgress = useMemo(() => getLevelProgress(profile.points), [profile.points])
  const rewardSummary = useMemo(() => [
    { label: 'Current points', value: profile.points, icon: Trophy },
    { label: 'Current level', value: `Lv ${currentLevel}`, icon: Crown },
    { label: 'Streak', value: `${streakInfo.current} days`, icon: Zap },
    { label: 'Badges', value: badges.length, icon: Medal },
  ], [badges.length, currentLevel, profile.points, streakInfo.current])

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-rewards flex min-h-screen items-center justify-center p-6">
        <div className="usr-card usr-pop-in p-6 text-center">
          <span className="usr-spin mx-auto mb-3 flex h-6 w-6 rounded-full border-2 border-teal-700 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-600">Loading your rewards...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="tourism-shell usr-section-page usr-rewards min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-5xl px-3 pb-10 pt-2 sm:px-4 lg:px-6">
        <UserSectionHeader
          eyebrow="Your progress"
          title="Rewards"
          description="Track your points, unlock badges, and redeem community perks as you explore Daet."
          emoji="🏆"
        >
          <span className="usr-section-counter">Level {currentLevel}</span>
        </UserSectionHeader>

        <div className="usr-section-hero usr-section-hero-dark usr-enter">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">Member rewards</p>
              <h2 className="mt-2 break-words text-2xl font-black sm:text-3xl">{profile.full_name}</h2>
              <p className="mt-1 max-w-prose text-sm text-white/70">Earn points by sharing stories, joining forum discussions, and attending community events.</p>
            </div>
            <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur-sm md:self-auto">
              <Crown className="h-4 w-4" aria-hidden="true" />
              Level {currentLevel}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rewardSummary.map(({ label, value, icon: Icon }) => (
              <div key={label} className="usr-lift rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">{label}</p>
                    <p className="mt-2 text-xl font-black">{value}</p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="usr-stagger space-y-6">
            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Progress</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Level progress</h3>
                </div>
                <Sparkles className="h-4 w-4 text-violet-600" />
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>Lv {currentLevel}</span>
                  <span>{profile.points} pts</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500" style={{ width: `${levelProgress}%` }} />
                </div>
              </div>
            </div>

            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Milestones</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Badges & achievements</h3>
                </div>
                <Award className="h-4 w-4 text-amber-500" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {badges.length ? badges.map((badge, index) => (
                  <div key={`${badge.name}-${index}`} className="usr-lift rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <Star className="h-4 w-4 fill-current" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{badge.name}</p>
                        <p className="text-xs text-slate-500">{badge.description}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 sm:col-span-2">
                    Start participating to unlock badges and achievements.
                  </div>
                )}
              </div>
            </div>

            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Activity</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Points history</h3>
                </div>
                <Gift className="h-4 w-4 text-emerald-500" />
              </div>

              <div className="space-y-3">
                {pointsHistory.length ? pointsHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{entry.reason}</p>
                      <p className="text-xs text-slate-500">{formatDate(entry.created_at)}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">+{entry.points}</span>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Your recent earning history will appear here.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="usr-stagger space-y-6">
            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Leaderboards</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Top contributors</h3>
                </div>
                <Trophy className="h-4 w-4 text-violet-600" />
              </div>

              <div className="space-y-3">
                {leaderboard.length ? leaderboard.map((person, index) => (
                  <div key={person.id} className="flex items-center justify-between border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        {person.avatar_url ? <img src={person.avatar_url} alt={person.name} className="h-full w-full object-cover" /> : getInitials(person.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{person.name}</p>
                        <p className="text-xs text-slate-500">#{index + 1}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-violet-700">{person.points} pts</span>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Leaderboard data will appear as more users participate.
                  </div>
                )}
              </div>
            </div>

            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Streak</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Daily login streak</h3>
                </div>
                <Zap className="h-4 w-4 text-cyan-500" />
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-3xl font-bold text-slate-900">{streakInfo.current} days</p>
                <p className="mt-2 text-sm text-slate-600">Longest streak: {streakInfo.longest} days</p>
              </div>
            </div>

            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Rewards</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Redeem</h3>
                </div>
                <Gift className="h-4 w-4 text-emerald-500" />
              </div>

              <div className="space-y-3">
                {rewards.map((reward) => (
                  <button key={reward.title} type="button" onClick={() => redeemReward(reward)} disabled={Boolean(redeeming) || redeemedRewards.includes(reward.title)} className="usr-lift flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{reward.title}</p>
                      <p className="text-xs text-slate-500">{reward.points} points</p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">{redeeming === reward.title ? 'Redeeming...' : redeemedRewards.includes(reward.title) ? 'Redeemed' : 'Redeem'}</span>
                  </button>
                ))}
                {redemptionNotice && <p className="text-xs font-semibold text-violet-700">{redemptionNotice}</p>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
