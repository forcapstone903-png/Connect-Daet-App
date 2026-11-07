'use client'

import Link from 'next/link'

export default function UserProfileLink({ user, href, children, className, onClick, ariaLabel, prefetch = false, ...props }) {
  const userId = user?.id || user?.user_id || user?.userId || null
  const profileHref = href || (userId ? `/user/profile/${encodeURIComponent(userId)}` : '/user/profile')

  if (!userId && !href) {
    return <>{children}</>
  }

  return (
    <Link
      href={profileHref}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel || `View ${user?.full_name || user?.email || 'user'}'s profile`}
      prefetch={prefetch}
      {...props}
    >
      {children}
    </Link>
  )
}
