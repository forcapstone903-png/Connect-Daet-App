'use client';

import { useEffect, useState } from 'react';

/**
 * Hydration-safe localStorage-backed setting object.
 *
 * Starts with `initialValue`, then after mount merges any saved value from
 * localStorage on top of it. Safe for Next.js server/prerender rendering.
 *
 * @param {string} key          localStorage key (e.g. 'site_settings')
 * @param {object} initialValue Default shape used during SSR and as fallback
 * @returns {[object, Function]} [value, setValue]
 */
export default function useStoredSetting(key, initialValue) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          setValue((prev) => ({ ...prev, ...parsed }));
        }
      } catch (err) {
        console.error(`Error loading ${key}:`, err);
      }
    };
    load();
  }, [key]);

  return [value, setValue];
}