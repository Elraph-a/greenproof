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

import { supabase } from './supabase'

const BUILT_IN = import.meta.env.VITE_ML_URL as string | undefined
const CACHE_KEY = 'greenproof.mlUrl'

/**
 * WHERE THE SERVICE URL COMES FROM, AND WHY NOT SIMPLY THE ENV VAR.
 *
 * Vite inlines env vars at BUILD time, so changing VITE_ML_URL in Vercel does
 * nothing until the frontend is rebuilt and redeployed. Fine for a permanent
 * host; unworkable for a tunnelled service whose hostname changes whenever the
 * tunnel restarts.
 *
 * So the live value lives in one row of `app_config` and EVERY device reads the
 * same one. Storing it per-device in localStorage was considered and rejected:
 * it works on the phone you set it up on and silently fails on anyone else's,
 * which is precisely wrong for something a judge might open.
 *
 * Order of precedence:
 *   1. app_config.ml_url   - the live value, changed without any rebuild
 *   2. VITE_ML_URL         - build-time fallback for a permanent deployment
 *
 * localStorage still appears here, but ONLY as a cache of what the database
 * last said. It exists so the first scoring request after a cold app start does
 * not have to wait on a config round-trip, never as a source of truth, and it
 * is overwritten by the database on every load.
 */
let liveUrl: string | null | undefined

function cachedUrl(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY)
  } catch {
    // Private browsing and locked-down webviews throw on access.
    return null
  }
}

function mlUrl(): string | undefined {
  if (liveUrl !== undefined) return liveUrl ?? BUILT_IN
  return cachedUrl() ?? BUILT_IN
}

/**
 * Read the configured URL once at startup. Never throws, never blocks render.
 *
 * A failure here leaves the cached or built-in value in place rather than
 * clearing it: losing the config because the network blinked would turn a
 * working demo into a dead one.
 */
export async function primeMlUrl(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'ml_url')
      .maybeSingle()
    if (error) return

    const value = (data?.value ?? '').trim().replace(/\/$/, '')
    liveUrl = value === '' ? null : value
    try {
      if (liveUrl) localStorage.setItem(CACHE_KEY, liveUrl)
      else localStorage.removeItem(CACHE_KEY)
    } catch {
      /* cache is an optimisation, not a requirement */
    }
  } catch {
    /* keep whatever we already had */
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
