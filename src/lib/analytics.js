const CONSENT_KEY = 'daet-analytics-consent'

export function getAnalyticsConsent() {
  if (typeof window === 'undefined') return 'denied'

  const stored = window.localStorage.getItem(CONSENT_KEY)
  return stored === 'granted' ? 'granted' : 'denied'
}

export function setAnalyticsConsent(choice) {
  if (typeof window === 'undefined') return

  const value = choice === 'granted' ? 'granted' : 'denied'
  window.localStorage.setItem(CONSENT_KEY, value)
  window.dispatchEvent(new CustomEvent('daet-analytics-consent', { detail: { consent: value } }))
}

export function trackEvent(eventName, properties = {}) {
  if (typeof window === 'undefined') return
  if (getAnalyticsConsent() !== 'granted') return

  const payload = {
    event: eventName,
    properties,
    timestamp: new Date().toISOString(),
  }

  if (window.dataLayer) {
    window.dataLayer.push(payload)
  }

  if (window.gtag) {
    window.gtag('event', eventName, properties)
  }
}
