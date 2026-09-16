import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import CookieConsent from '@/components/CookieConsent'
import PushNotificationPrompt from '@/components/PushNotificationPrompt'
import AlertToast from '@/components/AlertToast'
import UserSettingsProvider from '@/components/UserSettingsProvider'
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/themeBootstrap'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CONNECT-Daet',
  description: 'Connect with local artisans and tour operators in Daet, Camarines Norte, Philippines.',
  manifest: '/manifest.webmanifest',
  keywords: ['Daet', 'Camarines Norte', 'tourism', 'community', 'travel', 'Philippines'],
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Runs before hydration so the saved theme/language never flashes. */}
        <Script
          id="daet-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <UserSettingsProvider>
          <main>{children}</main>
        </UserSettingsProvider>
        <CookieConsent />
        <PushNotificationPrompt />
        <AlertToast />
      </body>
    </html>
  )
}
