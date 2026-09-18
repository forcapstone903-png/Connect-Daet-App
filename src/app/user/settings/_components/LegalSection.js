'use client'

import Link from 'next/link'
import { Accessibility, Code2, Cookie, FileText, Info, MessageSquareText, ShieldCheck } from 'lucide-react'
import { ActionRow, SettingsCard } from './SettingsControls'

const LEGAL_LINKS = [
  { key: 'settings.legal.privacy', href: '/legal/privacy-policy', icon: ShieldCheck },
  { key: 'settings.legal.terms', href: '/legal/terms-and-conditions', icon: FileText },
  { key: 'settings.legal.dataPrivacy', href: '/legal/form-consent', icon: Info },
]

export default function LegalSection({ t, appVersion = '0.1.0' }) {
  return (
    <SettingsCard
      icon={Info}
      title={t('settings.legal.title')}
      description={t('settings.legal.description')}
    >
      {LEGAL_LINKS.map(({ key, href, icon: Icon }) => (
        <ActionRow key={href} icon={Icon} label={t(key)}>
          <Link href={href} className="text-xs font-bold text-sky-700">{t(key)}</Link>
        </ActionRow>
      ))}

      <ActionRow icon={Cookie} label={t('settings.legal.cookiePolicy')} hint={t('settings.legal.cookiePolicyHint')}>
        <Link href="/legal/cookie-policy" className="text-xs font-bold text-sky-700">{t('settings.legal.cookiePolicy')}</Link>
      </ActionRow>

      <ActionRow icon={Accessibility} label={t('settings.legal.accessibility')} hint={t('settings.legal.accessibilityHint')}>
        <Link href="/legal/accessibility" className="text-xs font-bold text-sky-700">{t('settings.legal.accessibility')}</Link>
      </ActionRow>

      <ActionRow icon={Code2} label={t('settings.legal.developers')} hint={t('settings.legal.developersHint')}>
        <Link href="/legal/developers" className="text-xs font-bold text-sky-700">{t('settings.legal.developers')}</Link>
      </ActionRow>

      <ActionRow icon={MessageSquareText} label={t('settings.legal.support')} hint={t('settings.legal.supportHint')}>
        <Link href="/user/feedback" className="text-xs font-bold text-sky-700">{t('settings.legal.support')}</Link>
      </ActionRow>

      <p className="pt-1 text-center text-xs text-slate-400">CONNECT-Daet · v{appVersion}</p>
    </SettingsCard>
  )
}