'use client'

import { useEffect, useState } from 'react'
import { Gift, Plus, Sparkles, Trash2 } from 'lucide-react'
import SettingsShell from '../_components/SettingsShell'
import { DEFAULT_REWARD_SETTINGS } from '@/lib/rewardSettings.mjs'

const REWARDS_API = '/info/api/admin/rewards'

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_REWARD_SETTINGS))
}

async function readJsonResponse(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`)
  }
}

export default function AdminRewardsSettingsPage() {
  const [settings, setSettings] = useState(cloneDefaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      try {
        const response = await fetch(REWARDS_API, { cache: 'no-store' })
        const data = await readJsonResponse(response)
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Unable to load rewards (${response.status}).`)
        }
        if (active) setSettings(data.settings)
      } catch (error) {
        if (active) setLoadError(error.message || 'Unable to load saved reward settings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadSettings()
    return () => {
      active = false
    }
  }, [])

  return (
    <SettingsShell
      title="Rewards & Points"
      subtitle="Configure the supported ways users earn points and the rewards they can redeem."
    >
      {(showToast) => {
        const saveSettings = async () => {
          setSaving(true)
          try {
            const response = await fetch(REWARDS_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings }),
            })
            const data = await readJsonResponse(response)
            if (!response.ok || !data.success) {
              throw new Error(data.message || `Unable to save rewards (${response.status}).`)
            }
            setSettings(data.settings)
            showToast('Reward and points settings saved.')
          } catch (error) {
            showToast(error.message || 'Unable to save reward settings.', true)
          } finally {
            setSaving(false)
          }
        }

        const updateAction = (key, patch) => {
          setSettings((current) => ({
            ...current,
            actions: { ...current.actions, [key]: { ...current.actions[key], ...patch } },
          }))
        }

        const updateReward = (id, patch) => {
          setSettings((current) => ({
            ...current,
            rewards: current.rewards.map((reward) => reward.id === id ? { ...reward, ...patch } : reward),
          }))
        }

        const addReward = () => {
          setSettings((current) => ({
            ...current,
            rewards: [...current.rewards, {
              id: `reward-${crypto.randomUUID()}`,
              title: '',
              description: '',
              points: 100,
              enabled: true,
            }],
          }))
        }

        const updateMilestone = (index, patch) => {
          setSettings((current) => ({
            ...current,
            milestones: current.milestones.map((milestone, milestoneIndex) =>
              milestoneIndex === index ? { ...milestone, ...patch } : milestone
            ),
          }))
        }

        return (
          <div className="space-y-6">
            {loadError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {loadError} Changes cannot be saved until the settings store is available.
              </p>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Sparkles className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Point-earning actions</h2>
                  <p className="mt-1 text-sm text-slate-600">These values are applied by the database when content is approved or a qualifying comment is added.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {Object.entries(settings.actions).map(([key, action]) => (
                  <div key={key} className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-800">{action.label}</h3>
                    <label className="mt-4 block text-sm font-medium text-slate-700">
                      Points per action
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        step="0.01"
                        value={action.points}
                        onChange={(event) => updateAction(key, { points: Number(event.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>
                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={(event) => updateAction(key, { enabled: event.target.checked })}
                        className="h-4 w-4 accent-blue-600"
                      />
                      Award points for this action
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-amber-50 p-2 text-amber-700"><Sparkles className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Achievement milestones</h2>
                    <p className="mt-1 text-sm text-slate-600">Set the point threshold and description users need to unlock each badge.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings((current) => ({
                    ...current,
                    milestones: [...current.milestones, { name: '', description: '', points: 100 }],
                  }))}
                  disabled={loading || saving || settings.milestones.length >= 50}
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Add milestone
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {settings.milestones.map((milestone, index) => (
                  <div key={`${milestone.name}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_150px_auto]">
                    <label className="text-sm font-medium text-slate-700">
                      Achievement name
                      <input value={milestone.name} onChange={(event) => updateMilestone(index, { name: event.target.value })} maxLength={60} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Unlock description
                      <input value={milestone.description} onChange={(event) => updateMilestone(index, { description: event.target.value })} maxLength={160} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Points required
                      <input type="number" min="0" max="1000000" step="1" value={milestone.points} onChange={(event) => updateMilestone(index, { points: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                    </label>
                    <button type="button" aria-label={`Remove ${milestone.name || 'new milestone'}`} onClick={() => setSettings((current) => ({ ...current, milestones: current.milestones.filter((_, milestoneIndex) => milestoneIndex !== index) }))} className="self-start rounded-lg p-2 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!settings.milestones.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No achievement milestones configured.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Gift className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Redeemable rewards</h2>
                    <p className="mt-1 text-sm text-slate-600">Set each reward’s title, description, point cost, and availability.</p>
                  </div>
                </div>
                <button type="button" onClick={addReward} disabled={loading || saving || settings.rewards.length >= 50} className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Add reward
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {settings.rewards.map((reward) => (
                  <div key={reward.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_150px_auto]">
                    <label className="text-sm font-medium text-slate-700">
                      Reward title
                      <input value={reward.title} onChange={(event) => updateReward(reward.id, { title: event.target.value })} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                      <span className="mt-1 block text-xs font-normal text-slate-500">Reward ID: {reward.id}</span>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Description
                      <input value={reward.description} onChange={(event) => updateReward(reward.id, { description: event.target.value })} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Points required
                      <input type="number" min="1" max="1000000" step="1" value={reward.points} onChange={(event) => updateReward(reward.id, { points: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                      <span className="mt-2 flex items-center gap-2 font-normal">
                        <input type="checkbox" checked={reward.enabled} onChange={(event) => updateReward(reward.id, { enabled: event.target.checked })} className="h-4 w-4 accent-blue-600" />
                        Available to users
                      </span>
                    </label>
                    <button type="button" aria-label={`Remove ${reward.title || 'new reward'}`} onClick={() => setSettings((current) => ({ ...current, rewards: current.rewards.filter((entry) => entry.id !== reward.id) }))} className="self-start rounded-lg p-2 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!settings.rewards.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No rewards configured. Add one to make it available for redemption.</p>}
              </div>
            </section>

            <button type="button" onClick={saveSettings} disabled={loading || saving || Boolean(loadError)} className="rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save rewards settings'}
            </button>
          </div>
        )
      }}
    </SettingsShell>
  )
}
