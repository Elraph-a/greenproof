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

const ML_URL = import.meta.env.VITE_ML_URL

export interface ScoreResult {
  checkin_id: string
  confidence: number
  verdict: 'pending' | 'verified' | 'review' | 'flagged'
  signals: Record<string, unknown>
}

export function mlConfigured(): boolean {
  return Boolean(ML_URL)
}

/** Request scoring without waiting for it. Never throws. */
export function requestScoring(checkinId: string): void {
  if (!ML_URL) return
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
  if (!ML_URL) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${ML_URL.replace(/\/$/, '')}/score`, {
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
