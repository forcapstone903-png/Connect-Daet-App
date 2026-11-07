'use client';

import { useState } from 'react';
import './AdminAvatar.css';

export default function AdminAvatar({ user }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = user?.profile_image_url?.trim() || user?.avatar_url?.trim() || '';
  const name = user?.full_name?.trim() || user?.user_name?.trim() || user?.email || 'User';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0].toUpperCase()).join('') || 'U';

  return (
    <span className="admin-user-avatar rounded-full" aria-hidden="true">
      {src && src !== failedSrc ? (
        // Direct profile URLs retain existing browser caching; failures use local initials.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={36} height={36} decoding="async" onError={() => setFailedSrc(src)} />
      ) : initials}
    </span>
  );
}
