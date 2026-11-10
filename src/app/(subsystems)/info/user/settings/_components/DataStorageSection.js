'use client'

import { Download, HardDrive, RotateCcw, Smartphone, Trash2 } from 'lucide-react'
import { ActionRow, LinkButton, PrimaryButton, SettingsCard, StatusBanner } from './SettingsControls'
import PwaInstaller from '@/components/PwaInstaller'

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1000) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

export default function DataStorageSection({
  t,
  storageUsage,
  onClearCache,
  onDownloadData,
  onResetSettings,
  cacheCleared,
  resetPending,
  clearingCache,
  exportPending,
}) {
  return (
    <SettingsCard
      icon={HardDrive}
      title={t('settings.data.title')}
      description={t('settings.data.description')}
    >
      <ActionRow icon={HardDrive} label={t('settings.data.storageStatus')} hint={`${formatBytes(storageUsage.bytes)} · ${storageUsage.entries}`}>
        <span className="text-xs font-bold text-slate-500">{formatBytes(storageUsage.bytes)}</span>
      </ActionRow>

      <ActionRow
        icon={Trash2}
        label={t('settings.data.clearCache')}
        hint={t('settings.data.clearCacheHint')}
      >
        <PrimaryButton onClick={onClearCache} disabled={clearingCache} tone="neutral">
          {clearingCache ? t('common.saving') : t('settings.data.clearCache')}
        </PrimaryButton>
      </ActionRow>

      <ActionRow
        icon={Download}
        label="Download my personal data"
        hint="Download a private JSON export of your account, profile settings, activity, and supported community content."
      >
        <PrimaryButton onClick={onDownloadData} disabled={exportPending} tone="neutral">
          {exportPending ? t('common.saving') : 'Download data'}
        </PrimaryButton>
      </ActionRow>

      <ActionRow label={t('settings.legal.privacy')} hint="Read how DAET CONNECT handles personal information.">
        <LinkButton href="/info/legal/privacy-policy">{t('settings.legal.privacy')}</LinkButton>
      </ActionRow>

      <ActionRow
        icon={RotateCcw}
        label={t('common.reset')}
        hint={t('settings.data.description')}
      >
        <PrimaryButton onClick={onResetSettings} disabled={resetPending} tone="danger">{t('common.reset')}</PrimaryButton>
      </ActionRow>

      <ActionRow icon={Smartphone} label={t('settings.data.install')} hint={t('settings.data.installHint')}>
        <span className="max-w-[220px] text-right text-xs font-semibold text-slate-500">{t('settings.data.installReady')}</span>
      </ActionRow>

      {cacheCleared ? <StatusBanner tone="success">{t('settings.data.cleared')}</StatusBanner> : null}

      {/* Mounted only inside this tab: registering the service worker and the
          browser install prompt stay opt-in from Settings. */}
      <PwaInstaller />
    </SettingsCard>
  )
}