'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Camera, Mail, UserRound } from 'lucide-react'
import { SettingsCard } from './SettingsControls'

function ProfileValue({ label, value, icon: Icon, detail }) {
  return (
    <div className="settings-profile-value">
      <span className="settings-action-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="settings-control-hint">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || 'Not set'}</p>
        {detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}
      </div>
    </div>
  )
}

export default function ProfileInformationSection({ profile, email }) {
  const displayName = profile?.fullName || 'Your name'

  return (
    <SettingsCard
      className="settings-profile-card"
      icon={UserRound}
      title="Profile Information"
      description="Review the personal details connected to your DAET CONNECT account."
    >
      <div className="settings-profile-summary">
        <span className="settings-profile-avatar">
          {profile?.avatarUrl
            ? <Image src={profile.avatarUrl} alt="" width={72} height={72} unoptimized />
            : <UserRound className="h-8 w-8" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-slate-900">{displayName}</h3>
          <p className="mt-1 text-sm text-slate-500">Your public profile name and photo.</p>
        </div>
        <Link href="/info/user/profile/edit" aria-label="Change profile picture and profile details" className="settings-profile-edit-icon">
          <Camera className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="settings-profile-values grid gap-2 sm:grid-cols-2">
        <ProfileValue label="Full name" value={profile?.fullName} icon={UserRound} />
        <ProfileValue
          label="Email address"
          value={email || profile?.email}
          icon={Mail}
          detail={profile?.emailVerified ? 'Verified account email' : 'Email verification is not confirmed.'}
        />
      </div>
    </SettingsCard>
  )
}
