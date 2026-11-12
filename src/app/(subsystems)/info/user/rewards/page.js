'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Briefcase,
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
import { DEFAULT_REWARD_SETTINGS } from '@/lib/rewardSettings.mjs'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import UserSectionHeader from '@/app/(subsystems)/info/components/user/UserSectionHeader'

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

export default function UserRewardsPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({ full_name: 'Traveler', points: 0, level: 1, avatar_url: '' })
  const [userId, setUserId] = useState('')
  const [pointsHistory, setPointsHistory] = useState([])
  const [activityHistory, setActivityHistory] = useState([])
  const [activityHistoryError, setActivityHistoryError] = useState('')
  const [rewards, setRewards] = useState([])
  const [badgeMilestones, setBadgeMilestones] = useState(DEFAULT_REWARD_SETTINGS.milestones)
  const [rewardCatalogError, setRewardCatalogError] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [badges, setBadges] = useState([])
  const [streakInfo, setStreakInfo] = useState({ current: 0, longest: 0 })
  const [weeklyActivityDates, setWeeklyActivityDates] = useState([])
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

    queueMicrotask(() => setUserId(userId))
    const loadRewards = async () => {
      try {
        let milestones = DEFAULT_REWARD_SETTINGS.milestones
        try {
          const catalogResponse = await fetch('/info/api/rewards/catalog', { cache: 'no-store', credentials: 'same-origin' })
          const catalog = await catalogResponse.json()
          if (!catalogResponse.ok || !catalog.success) {
            throw new Error(catalog.message || 'Unable to load available rewards.')
          }
          setRewards(catalog.rewards || [])
          setRedeemedRewards(catalog.redeemedRewardIds || [])
          milestones = catalog.milestones || milestones
          setBadgeMilestones(milestones)
        } catch (error) {
          setRewardCatalogError(error.message || 'Unable to load available rewards.')
        }

        const weekStart = new Date()
        weekStart.setUTCHours(0, 0, 0, 0)
        weekStart.setUTCDate(weekStart.getUTCDate() - 6)
        const [{ data: userData }, { data: pointsRows }, { data: badgeRows }, { data: leaderboardRows }, { data: activityRows, error: activityError }, { data: weekActivityRows, error: weekActivityError }] = await Promise.all([
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
            .select('id, activity_type, entity_type, entity_id, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(8),
          supabase
            .from('user_activity_log')
            .select('created_at')
            .eq('user_id', userId)
            .gte('created_at', weekStart.toISOString())
            .order('created_at', { ascending: true })
            .limit(100),
        ])
        if (weekActivityError) console.error('Rewards weekly streak load failed:', weekActivityError.message)

        const nextPoints = Number(userData?.points || currentSession?.points || 0)
        const earnedBadges = getRewardBadges(nextPoints, milestones)
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
        if (activityError) {
          console.error('Rewards activity history load failed:', activityError)
          setActivityHistoryError('Your recent activity could not be loaded.')
        } else {
          setActivityHistory((activityRows || []).map((entry) => ({
            ...entry,
            title: entry.description || String(entry.activity_type || 'Activity').replace(/_/g, ' '),
          })))
          setActivityHistoryError('')
        }
        setBadges(allBadges)
        setLeaderboard((leaderboardRows || []).map((entry) => ({
          id: entry.id,
          name: entry.full_name || 'Traveler',
          points: Number(entry.points || 0),
          avatar_url: entry.profile_image_url || '',
        })))
        setStreakInfo(getDailyStreak((activityRows || []).map((entry) => entry.created_at?.slice(0, 10)).filter(Boolean)))
        setWeeklyActivityDates(weekActivityError ? [] : [...new Set((weekActivityRows || []).map((entry) => entry.created_at?.slice(0, 10)).filter(Boolean))])
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

    setRedeeming(reward.id)
    setRedemptionNotice('')
    try {
      const response = await fetch('/info/api/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ rewardId: reward.id }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to redeem this reward.')
      setProfile((current) => ({ ...current, points: result.points }))
      window.dispatchEvent(new CustomEvent('daet-user-points-updated', { detail: { points: result.points } }))
      setRedeemedRewards((current) => [...current, reward.id])
      setRedemptionNotice(result.warning ? `${result.message} ${result.warning}` : result.message)
    } catch (error) {
      setRedemptionNotice(error.message)
    } finally {
      setRedeeming('')
    }
  }

  const currentLevel = useMemo(() => getLevelFromPoints(profile.points), [profile.points])
  const levelProgress = useMemo(() => getLevelProgress(profile.points), [profile.points])
  const weekDays = useMemo(() => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setUTCDate(today.getUTCDate() - (6 - index))
      const key = date.toISOString().slice(0, 10)
      return {
        key,
        label: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2),
        day: date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
        active: weeklyActivityDates.includes(key),
      }
    })
  }, [weeklyActivityDates])
  const rewardSummary = [
    { label: 'Current points', value: Number(profile.points).toLocaleString('en-US', { maximumFractionDigits: 2 }), icon: Trophy },
    { label: 'Current level', value: `Lv ${currentLevel}`, icon: Crown },
    { label: 'Streak', value: `${streakInfo.current} ${streakInfo.current === 1 ? 'day' : 'days'}`, icon: Zap },
    { label: 'Badges', value: badges.length, icon: Medal },
  ]
  const earnedBadgeNames = useMemo(() => new Set(badges.map((badge) => badge.name)), [badges])

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
      <div className="usr-section-container usr-rewards-container mx-auto max-w-5xl px-3 pb-10 pt-2 sm:px-4 lg:px-6">
        <UserSectionHeader
          eyebrow="Your progress"
          title="Your Rewards"
          description="Track your points, unlock badges, and redeem community perks as you explore Daet."
          emoji="🏆"
          hideMobileTitle
        >
          <span className="usr-section-counter usr-rewards-level-chip">Level {currentLevel}</span>
        </UserSectionHeader>

        <div className="usr-section-hero usr-section-hero-dark usr-rewards-hero usr-enter">
          <Trophy className="usr-rewards-hero-trophy" aria-hidden="true" />
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

          <div className="usr-rewards-summary-grid mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rewardSummary.map(({ label, value, icon: Icon }) => (
              <div key={label} className="usr-rewards-summary-tile usr-lift rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
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

        <div className="usr-rewards-sections grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="usr-stagger usr-rewards-primary-column space-y-6">
            <div className="usr-card usr-enter usr-rewards-progress-card p-4 sm:p-5">
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
                <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgress}>
                  <div className="usr-rewards-progress-fill h-full rounded-full" style={{ width: `${levelProgress}%` }} />
                </div>
                <p className="usr-rewards-progress-caption mt-2 text-right text-xs text-slate-500">{levelProgress}% progress</p>
              </div>
            </div>

            <div className="usr-card usr-enter usr-rewards-badges-card p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Milestones</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Badges & achievements</h3>
                </div>
                <Award className="h-4 w-4 text-amber-500" />
              </div>

              <div className="usr-rewards-badge-list">
                {badgeMilestones.map((badge) => {
                  const earned = earnedBadgeNames.has(badge.name)
                  return (
                  <div key={badge.name} className={`usr-rewards-badge${earned ? ' is-earned' : ' is-locked'}`}>
                    <div className="flex items-center gap-3">
                      <div className="usr-rewards-badge-icon">
                        <Star className={`h-4 w-4 ${earned ? 'fill-current' : ''}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800">{badge.name}</p>
                        <p className="text-xs text-slate-500">{earned ? (badges.find((item) => item.name === badge.name)?.description || badge.description) : `${badge.description} · ${badge.points} pts`}</p>
                      </div>
                    </div>
                  </div>
                  )
                })}
                {badges.filter((badge) => !badgeMilestones.some((milestone) => milestone.name === badge.name)).map((badge, index) => (
                  <div key={`${badge.name}-${index}`} className="usr-rewards-badge is-earned">
                    <div className="flex items-center gap-3">
                      <div className="usr-rewards-badge-icon"><Star className="h-4 w-4 fill-current" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800">{badge.name}</p>
                        <p className="text-xs text-slate-500">{badge.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="usr-card usr-enter usr-rewards-history-card p-4 sm:p-5">
              <div className="profile-overview-heading">
                <div>
                  <p className="profile-overview-eyebrow">Points</p>
                  <h3>Recent rewards history</h3>
                </div>
                <Briefcase aria-hidden="true" />
              </div>

              <ul className="profile-point-history">
                {pointsHistory.length ? pointsHistory.map((entry) => (
                  <li key={entry.id}>
                    <span><strong>{entry.reason}</strong><small>{formatDate(entry.created_at)}</small></span>
                    <b data-positive={entry.points >= 0}>{entry.points > 0 ? '+' : ''}{entry.points}</b>
                  </li>
                )) : (
                  <li className="text-sm text-slate-500">
                    Your recent earning history will appear here.
                  </li>
                )}
              </ul>
            </div>

            <div className="usr-card usr-enter usr-rewards-history-card p-4 sm:p-5">
              <div className="profile-overview-heading">
                <div>
                  <p className="profile-overview-eyebrow">Your account</p>
                  <h3>Recent activity</h3>
                </div>
                <Sparkles aria-hidden="true" />
              </div>
              {activityHistoryError ? (
                <p role="alert" className="mt-3 text-sm text-red-700">{activityHistoryError}</p>
              ) : activityHistory.length ? (
                <ul className="profile-point-history">
                  {activityHistory.map((entry) => (
                    <li key={entry.id}>
                      <span><strong>{entry.title}</strong><small>{formatDate(entry.created_at)}</small></span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Your community activity will appear here.</p>
              )}
            </div>
          </section>

          <aside className="usr-stagger usr-rewards-secondary-column space-y-6">
            <div id="rewards-leaderboard" className="usr-card usr-enter usr-rewards-leaderboard-card p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Leaderboards</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Top contributors</h3>
                </div>
                <Trophy className="h-4 w-4 text-violet-600" />
              </div>

              <div className="usr-rewards-leaderboard-list">
                {leaderboard.length ? leaderboard.map((person, index) => (
                  <div key={person.id} className={`usr-rewards-leaderboard-row${person.id === userId ? ' is-current-user' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="usr-rewards-rank">{index + 1}</span>
                      <div className="usr-rewards-leaderboard-avatar">
                        {person.avatar_url ? <img src={person.avatar_url} alt={person.name} className="h-full w-full object-cover" /> : getInitials(person.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{person.name}</p>
                        <p className="text-xs text-slate-500">#{index + 1}</p>
                      </div>
                    </div>
                    <span className="usr-rewards-leaderboard-points">{Number(person.points).toLocaleString('en-US', { maximumFractionDigits: 2 })} pts</span>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Leaderboard data will appear as more users participate.
                  </div>
                )}
              </div>
            </div>

            <div className="usr-card usr-enter usr-rewards-streak-card p-4 sm:p-5">
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
                <div className="usr-rewards-week" aria-label="Last seven days activity">
                  {weekDays.map((day) => (
                    <div key={day.key} className={`usr-rewards-week-day${day.active ? ' is-active' : ''}`} aria-label={`${day.key}${day.active ? ', active' : ', no activity'}`}>
                      <span>{day.label}</span>
                      <span>{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="usr-card usr-enter usr-rewards-redeem-card p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Rewards</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Redeem</h3>
                </div>
                <Gift className="h-4 w-4 text-emerald-500" />
              </div>

              <div className="usr-rewards-redeem-list">
                {rewardCatalogError && <p className="usr-rewards-redemption-notice" role="alert">{rewardCatalogError}</p>}
                {rewards.map((reward) => (
                  <button key={reward.id} type="button" onClick={() => redeemReward(reward)} disabled={Boolean(redeeming) || redeemedRewards.includes(reward.id)} className="usr-rewards-redeem-row usr-lift">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{reward.title}</p>
                      {reward.description && <p className="text-xs text-slate-500">{reward.description}</p>}
                      <p className="text-xs text-slate-500">{reward.points} points</p>
                    </div>
                    <span className="usr-rewards-redeem-button">{redeeming === reward.id ? 'Redeeming...' : redeemedRewards.includes(reward.id) ? 'Redeemed' : 'Redeem'}</span>
                  </button>
                ))}
                {!rewardCatalogError && rewards.length === 0 && <p className="text-sm text-slate-500">There are no rewards available right now.</p>}
                {redemptionNotice && <p className="usr-rewards-redemption-notice" role="status">{redemptionNotice}</p>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
