import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CONNECT-Daet',
  description: 'Connect with local artisans and tour operators in Daet',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={inter.className}>
        <main>{children}</main>
      </body>
    </html>
  )
}
