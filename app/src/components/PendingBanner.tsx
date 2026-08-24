import { useEffect, useState } from 'react'
import { listPending, type PendingRegistration } from '../lib/queue'
import { flushQueue } from '../lib/registrations'
import { Icon } from './Icon'
import { Spinner } from './ui'

/**
 * Makes the offline queue VISIBLE.
 *
 * A silent background retry is worse than no retry. If three trees are stuck,
 * the user has to find out ON THE DAY, while still standing near those trees
 * and able to re-register them — not a week later when the data is
 * unrecoverable and T0 cannot be repeated.
 *
 * So this is loud, always shows the count, and surfaces the last error verbatim.
 */
export function PendingBanner() {
  const [pending, setPending] = useState<PendingRegistration[]>([])
  const [flushing, setFlushing] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const items = await listPending()
        if (alive) setPending(items)
      } catch {
        /* IndexedDB unavailable — nothing useful to show */
      }
    }
    void tick()
    const timer = window.setInterval(tick, 3000)

    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (pending.length === 0) return null

  const stuck = pending.filter((p) => p.attempts >= 3)
  const lastError = stuck[0]?.lastError

  async function retry() {
    setFlushing(true)
    try {
      await flushQueue()
      setPending(await listPending())
    } finally {
      setFlushing(false)
    }
  }

  return (
    <div className="safe-top sticky top-0 z-[60] border-b-2 border-tertiary-container bg-tertiary-fixed px-margin-mobile py-3">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <Icon name="upload" size={22} className="shrink-0 text-on-tertiary-fixed" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-on-tertiary-fixed">
            {pending.length} {pending.length === 1 ? 'tree' : 'trees'} waiting to
            upload
          </p>
          <p className="text-label-lg text-on-tertiary-fixed">
            {!online
              ? 'Saved on your phone. They upload when you have signal.'
              : stuck.length > 0
                ? `Retrying. Last error: ${lastError ?? 'unknown'}`
                : 'Uploading now…'}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={flushing || !online}
          className="btn btn-outline shrink-0 px-4"
        >
          {flushing ? <Spinner /> : 'Retry'}
        </button>
      </div>
    </div>
  )
}
