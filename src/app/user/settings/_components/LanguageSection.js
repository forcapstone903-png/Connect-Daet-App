'use client'

import { Check, Languages } from 'lucide-react'
import { ChoiceCards, SettingsCard } from './SettingsControls'
import { LANGUAGES, createTranslator } from '@/lib/i18n'

export default function LanguageSection({ settings, t, onLanguageChange }) {
  const preview = createTranslator(settings.language)

  const options = LANGUAGES.map((item) => ({
    value: item.code,
    label: `${item.nativeLabel} (${item.label})`,
    hint: item.region,
  }))

  return (
    <SettingsCard
      icon={Languages}
      title={t('settings.language.title')}
      description={t('settings.language.description')}
    >
      <div>
        <p className="text-sm font-semibold text-slate-800">{t('settings.language.label')}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{t('settings.language.hint')}</p>
        <div className="mt-2">
          <ChoiceCards
            name={t('settings.language.label')}
            options={options}
            value={settings.language}
            onChange={onLanguageChange}
            columns={3}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('settings.language.preview')}</p>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />{preview('settings.title')}</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />{preview('settings.appearance.theme')}</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />{preview('settings.privacy.profileVisibility')}</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />{preview('settings.notifications.newFollowers')}</li>
        </ul>
      </div>
    </SettingsCard>
  )
}