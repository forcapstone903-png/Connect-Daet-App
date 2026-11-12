'use client'

import { useEffect, useState } from 'react'
import { buildPublicSettings } from './siteSettings.mjs'

// One request per page load, shared by every component that needs public
// settings. Memory only (no localStorage): values are re-read on reload and
// the server response itself is cached for 60 s.
const FALLBACK = buildPublicSettings()
let pending = null

function loadPublicSettings() {
  if (!pending) {
    pending = fetch('/info/api/site-settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => (result?.success ? result.settings : FALLBACK))
      .catch(() => {
        pending = null
        return FALLBACK
      })
  }
  return pending
}

export function usePublicSettings() {
  const [state, setState] = useState({ settings: FALLBACK, loaded: false })
  useEffect(() => {
    let active = true
    loadPublicSettings().then((settings) => {
      if (active) setState({ settings, loaded: true })
    })
    return () => { active = false }
  }, [])
  return state
}
