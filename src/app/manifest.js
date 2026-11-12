export default function manifest() {
  return {
    name: 'Connect Daet',
    short_name: 'Connect Daet',
    description: 'A mobile-friendly travel and community app for Daet, Camarines Norte.',
    start_url: '/info/user/dashboard',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-connect-daet-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-connect-daet-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
