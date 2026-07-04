import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const nextConfig = {
  output: 'export', // ✅ This creates the 'out' directory
  outputFileTracingRoot: path.join(__dirname),
  reactCompiler: true,
  // Additional settings for static export
  images: {
    unoptimized: true, // Required for static export
  },
  trailingSlash: true, // Better for static hosting
  // Skip these features that don't work with static export
  // (They'll be handled by your Cloudflare Pages functions)
}

export default nextConfig