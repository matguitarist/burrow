// Burrow's mark: a burrow's arches over the ground line. Used by the sidebar and the phone header.
export default function BurrowMark({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18a9 9 0 0 1 18 0" /><path d="M7 18a5 5 0 0 1 10 0" /><path d="M2 18h20" />
    </svg>
  )
}
