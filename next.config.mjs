import path from 'path'

import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const nextConfig = {

  outputFileTracingRoot: path.join(__dirname),

 reactCompiler: true,

}

export default nextConfig