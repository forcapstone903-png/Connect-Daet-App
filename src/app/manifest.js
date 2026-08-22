export default function manifest() {
  return {
    name: 'CONNECT Daet',
    short_name: 'Daet',
    description: 'A mobile-friendly travel and community app for Daet, Camarines Norte.',
    start_url: '/user/dashboard',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
