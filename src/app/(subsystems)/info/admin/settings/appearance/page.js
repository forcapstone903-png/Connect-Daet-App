'use client'

import { MonitorSmartphone, Moon, Sun } from 'lucide-react'
import SettingsShell from '../_components/SettingsShell'
import { useUserSettings } from '@/components/UserSettingsProvider'
import { THEME_OPTIONS } from '@/lib/userSettings'

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: MonitorSmartphone,
}

function AdminAppearanceSettings() {
  const { settings, resolvedTheme, t, updateSettings } = useUserSettings()

  return (
    <SettingsShell
      title="Appearance"
      subtitle="Set the theme and motion preferences for your staff account in this browser."
    >
      <div className="w-full space-y-6">
        <p className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-900">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700" aria-hidden="true">i</span>
          <span>These are personal browser preferences. They do not change the appearance for other users.</span>
        </p>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Sun className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">{t('settings.appearance.title')}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t('settings.appearance.description')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-7 p-5 sm:p-7">
            <fieldset>
              <legend className="text-sm font-bold text-slate-900">{t('settings.appearance.theme')}</legend>
              <p className="mt-1 text-sm leading-6 text-slate-500">{t('settings.appearance.themeHint')}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map((option) => {
                  const ThemeIcon = THEME_ICONS[option.value]
                  const selected = settings.theme === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateSettings({ theme: option.value })}
                      className={`group flex min-h-36 flex-col items-start rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                        selected
                          ? 'border-blue-600 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <ThemeIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="mt-3 flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">{t(option.labelKey)}</span>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-blue-600' : 'border-slate-300'
                        }`}>
                          {selected && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                        </span>
                      </span>
                      <span className="mt-1 text-xs leading-5 text-slate-500">{t(option.hintKey)}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{t('settings.appearance.reduceMotion')}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t('settings.appearance.reduceMotionHint')}</p>
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-3">
                <span className="text-sm font-medium text-slate-700">
                  {settings.reduceMotion ? 'On' : 'Off'}
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.reduceMotion}
                  onChange={(event) => updateSettings({ reduceMotion: event.target.checked })}
                  aria-label={t('settings.appearance.reduceMotion')}
                  className="peer sr-only"
                />
                <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>

            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600" aria-live="polite">
              <span className="font-semibold text-slate-800">{t('settings.appearance.currentTheme')}: </span>
              {settings.theme === 'system'
                ? `${t('settings.appearance.system')} (${t(resolvedTheme === 'dark' ? 'settings.appearance.dark' : 'settings.appearance.light')})`
                : t(resolvedTheme === 'dark' ? 'settings.appearance.dark' : 'settings.appearance.light')}
            </p>
          </div>
        </section>
      </div>
    </SettingsShell>
  )
}

export default function AdminAppearancePage() {
  return <AdminAppearanceSettings />
}
