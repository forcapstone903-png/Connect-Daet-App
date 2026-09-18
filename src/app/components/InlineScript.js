export function InlineScript({ html }) {
  // Rendered during HTML parsing so it runs before the first paint. React warns
  // in development about <script> inside a component, so the client copy is
  // inert (text/plain) and only the server copy (text/javascript) executes.
  // See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}