import { useState } from 'react'
import { clearMlOverride, mlOverrideUrl } from '../lib/ml'

/**
 * Shows when this device is pointed at a scoring service other than the one
 * baked into the build.
 *
 * WHY IT HAS TO BE VISIBLE
 * The override is stored in localStorage, so it survives reloads, app restarts
 * and redeploys, and it applies to ONE device. Without a banner, a phone that
 * was pointed at a dead tunnel three days ago would silently fail to score
 * while every other device worked — and the symptom, check-ins sitting at
 * `pending`, looks exactly like the service being down. That is hours of
 * debugging the wrong thing.
 *
 * Deliberately calmer than DemoBanner. Demo mode means nothing is being saved
 * and is an emergency. An override means scoring is being routed elsewhere,
 * which is a normal thing to do during a demo — it just must not be invisible.
 */
export function MlOverrideBanner() {
  const [url, setUrl] = useState(mlOverrideUrl)
  if (!url) return null

  // Hostname only: a tunnel URL is long and the useful part is which host.
  let host = url
  try {
    host = new URL(url).host
  } catch {
    /* show it raw if it will not parse */
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[99] flex items-center justify-center gap-2 bg-[var(--color-surface-container-high)] px-3 py-1 text-center text-[11px] font-semibold text-on-surface-variant"
    >
      <span className="truncate">Scoring via {host}</span>
      <button
        type="button"
        className="shrink-0 underline underline-offset-2"
        onClick={() => {
          clearMlOverride()
          setUrl(null)
        }}
      >
        reset
      </button>
    </div>
  )
}
