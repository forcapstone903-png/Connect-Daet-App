import path from 'path'

import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      ...(supabaseHostname
        ? [{
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/public/**',
          }]
        : [{
            protocol: 'https',
            hostname: '**.supabase.co',
            pathname: '/storage/v1/object/public/**',
          }]),
    ],
  },
};

export default nextConfig