'use client'

import Link from 'next/link'
import { Accessibility, Cookie, FileText, Info, MessageSquareText, ShieldCheck } from 'lucide-react'
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

      <ActionRow icon={Cookie} label="Cookie policy" hint="How consent cookies and local storage are used.">
        <Link href="/legal/cookie-policy" className="text-xs font-bold text-sky-700">Cookie policy</Link>
      </ActionRow>

      <ActionRow icon={Accessibility} label="Accessibility" hint="How the app supports low-vision and reduced-motion users.">
        <Link href="/legal/accessibility" className="text-xs font-bold text-sky-700">Accessibility</Link>
      </ActionRow>

      <ActionRow icon={MessageSquareText} label={t('settings.legal.support')} hint="Report a problem or suggest an improvement.">
        <Link href="/user/feedback" className="text-xs font-bold text-sky-700">{t('settings.legal.support')}</Link>
      </ActionRow>

      <p className="pt-1 text-center text-xs text-slate-400">CONNECT-Daet · v{appVersion}</p>
    </SettingsCard>
  )
}