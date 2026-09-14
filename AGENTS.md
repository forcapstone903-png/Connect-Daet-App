<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Caching

For every new or changed feature, consider caching before implementation. Read-heavy data must have an explicit cache key, TTL or invalidation rule, stale/offline behavior, security classification, and manual clear strategy. Invalidate or update related caches only after successful writes. Never place auth tokens, payment data, or sensitive user data in insecure shared storage or public caches.

Follow the repository standard in [`docs/caching.md`](docs/caching.md), and include its cache decision template in pull requests that add read-heavy data.
