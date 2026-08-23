/**
 * Asking the verification service to score a check-in.
 *
 * FIRE AND FORGET, DELIBERATELY.
 *
 * This call sends an id and nothing else. It cannot influence the verdict — the
 * service re-reads every input from the database and from storage, and holds the
 * only key permitted to write `confidence` / `verdict` / `signals`.
 *
 * If it fails, is slow, cold-starting, or not deployed yet, NOTHING BREAKS. The
 * check-in simply stays `pending` and gets picked up by `POST /backfill` later.
 * That property is what makes T0 safe to run before the ML service exists at
 * all: registration captures and uploads, and scoring is a separate, replayable
 * pass over photos that are already saved.
 */

const BUILT_IN = import.meta.env.VITE_ML_URL as string | undefined
const OVERRIDE_KEY = 'greenproof.mlUrl'

/**
 * WHY THE URL IS NOT SIMPLY `import.meta.env.VITE_ML_URL`.
 *
 * Vite inlines env vars at BUILD time, so changing VITE_ML_URL in Vercel does
 * nothing until the frontend is rebuilt and redeployed. That is fine for a
 * stable host and useless for a Cloudflare quick tunnel, whose hostname is
 * regenerated every time the tunnel restarts. Rebuilding the frontend to chase
 * a new hostname is not something to be doing before going on stage.
 *
 * So a runtime override, stored per-device, wins over the built-in value.
 *
 * IS THIS SAFE? Yes, and for a structural reason rather than a hopeful one.
 * Pointing the app at a different scoring service CANNOT forge a verdict:
 * `confidence`, `verdict` and `signals` are not granted to `authenticated` at
 * the column level, so only a holder of the service key can write them. The
 * request body is a check-in id and nothing else. The worst a bogus URL can do
 * is fail to score, which leaves the check-in `pending` for backfill — the
 * same state as no service at all.
 *
 * It is still made VISIBLE rather than silent — see MlOverrideBanner — because
 * an invisible redirect is a debugging nightmare even when it is harmless.
 */
function override(): string | null {
  try {
    return localStorage.getItem(OVERRIDE_KEY)
  } catch {
    // Private browsing and locked-down webviews throw on access.
    return null
  }
}

function mlUrl(): string | undefined {
  return override() ?? BUILT_IN
}

/** The active override, or null when the built-in build-time value is in use. */
export function mlOverrideUrl(): string | null {
  return override()
}

export function clearMlOverride(): void {
  try {
    localStorage.removeItem(OVERRIDE_KEY)
  } catch {
    /* nothing we can do, and nothing that should break the app */
  }
}

/**
 * Adopt `?ml=https://...` from the address bar, then remove it from the URL.
 *
 * Typing a tunnel hostname into a phone is miserable and error-prone, so the
 * demo flow is: open a link that carries the URL, and it sticks.
 *
 * HTTPS ONLY, with localhost exempted for development. The app is served over
 * HTTPS, and a browser refuses to let an HTTPS page call a plain HTTP address
 * — accepting one here would store a URL that silently never works.
 */
export function adoptMlUrlFromQuery(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('ml')
    if (raw === null) return

    params.delete('ml')
    const rest = params.toString()
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    )

    const value = raw.trim().replace(/\/$/, '')
    if (value === '') {
      clearMlOverride()
      return
    }
    const u = new URL(value)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !local) return
    localStorage.setItem(OVERRIDE_KEY, value)
  } catch {
    // A malformed URL is ignored rather than thrown: this runs before render.
  }
}

export interface ScoreResult {
  checkin_id: string
  confidence: number
  verdict: 'pending' | 'verified' | 'review' | 'flagged'
  signals: Record<string, unknown>
}

export function mlConfigured(): boolean {
  return Boolean(mlUrl())
}

/** Request scoring without waiting for it. Never throws. */
export function requestScoring(checkinId: string): void {
  if (!mlUrl()) return
  void scoreNow(checkinId).catch(() => {
    /* backfill will collect it */
  })
}

/**
 * Request scoring and wait for the result — used by the check-in flow, which
 * shows the four checks resolving one at a time.
 *
 * The Space sleeps on the free tier and a cold start is ~40 s, so the timeout is
 * generous. The UI shows progress rather than a frozen spinner.
 */
export async function scoreNow(
  checkinId: string,
  timeoutMs = 90_000,
): Promise<ScoreResult | null> {
  const base = mlUrl()
  if (!base) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkin_id: checkinId }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as ScoreResult
  } finally {
    clearTimeout(timer)
  }
}
