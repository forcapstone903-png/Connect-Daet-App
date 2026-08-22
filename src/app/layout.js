import { Inter } from 'next/font/google'
import './globals.css'
import PwaInstaller from '@/components/PwaInstaller'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CONNECT-Daet',
  description: 'Connect with local artisans and tour operators in Daet',
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main>{children}</main>
        <PwaInstaller />
      </body>
    </html>
  )
}
