'use client'

import AppearanceSection from '@/app/(subsystems)/info/user/settings/_components/AppearanceSection'
import SettingsShell from '../_components/SettingsShell'
import { useUserSettings } from '@/components/UserSettingsProvider'

function AdminAppearanceSettings() {
  const { settings, resolvedTheme, t, updateSettings } = useUserSettings()

  return (
    <SettingsShell
      title="Appearance"
      subtitle="Set the theme and motion preferences for this administrator account in this browser."
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          These are personal browser preferences. They do not change the appearance for other users.
        </p>
        <AppearanceSection
          settings={settings}
          t={t}
          resolvedTheme={resolvedTheme}
          onThemeChange={(theme) => updateSettings({ theme })}
          onReduceMotionChange={(reduceMotion) => updateSettings({ reduceMotion })}
        />
      </div>
    </SettingsShell>
  )
}

export default function AdminAppearancePage() {
  return <AdminAppearanceSettings />
}
