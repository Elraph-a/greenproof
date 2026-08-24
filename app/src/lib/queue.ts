/**
 * OFFLINE REGISTRATION QUEUE - the T0 insurance policy.
 *
 * On Monday you will register ~40 trees in one session, outdoors, on mobile
 * data, under tree canopy. Some uploads will fail. Without a queue, a failure
 * means the tree is simply gone: the photos existed only in a React state
 * variable and the user has already walked to the next tree.
 *
 * Losing four trees out of forty is a 10% hole in the pilot dataset that cannot
 * be patched afterwards, because the whole point is that T0 is a fixed moment in
 * time. This file is ~150 lines and removes that entire class of disaster.
 *
 * Design: a registration is written to IndexedDB *before* any network call is
 * attempted, and only deleted once the database row exists. Everything in
 * between is retried.
 *
 * IndexedDB rather than localStorage because localStorage stores strings only -
 * two 60 KB JPEGs would have to be base64'd (+33%) into a 5 MB quota shared with
 * everything else. IndexedDB stores Blobs natively with a quota in the hundreds
 * of MB.
 */

import type { TrunkTaps } from '../components/TrunkMeasure'

const DB_NAME = 'greenproof'
const DB_VERSION = 1
const STORE = 'pending-registrations'

export interface PendingRegistration {
  id: string
  captureId: string
  userId: string
  createdAt: number
  /** Bumped on each failed flush; surfaced so a permanently stuck item is visible. */
  attempts: number
  lastError?: string

  tree: {
    species: string | null
    tag_code: string | null
    lat: number
    lng: number
    heading_deg: number | null
  }
  checkin: {
    captured_at: string
    lat: number
    lng: number
    gps_accuracy_m: number | null
    heading_deg: number | null
    blur_score: number | null
    /**
     * Optional, and optional on purpose - most T0 trees are not measured.
     * Items queued before this field existed simply have it undefined, which
     * inserts as null; no migration of the IndexedDB queue is needed.
     */
    trunk_taps?: TrunkTaps | null
  }
  photos: {
    wide: Blob
    close: Blob
  }
  /** Storage paths already uploaded, so a retry doesn't re-send both photos. */
  uploaded: Partial<Record<'wide' | 'close', string>>

  /**
   * Set once the trees row exists.
   *
   * Submission is three steps (upload → insert tree → insert check-in) and a
   * connection can die between any two. Without recording the tree id, a retry
   * after step 2 succeeded would insert the tree a SECOND time - giving one
   * physical tree two rows at the same GPS point. That is exactly the condition
   * the "two people registered the same tree" proximity check is meant to
   * detect, so we would be manufacturing our own fraud signal and polluting the
   * pilot data with it.
   */
  treeId?: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'))
  })
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB write failed'))
        t.oncomplete = () => db.close()
      }),
  )
}

export function newPendingId(): string {
  return crypto.randomUUID()
}

export function enqueue(item: PendingRegistration): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(item))
}

export function update(item: PendingRegistration): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(item))
}

export function dequeue(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
}

export function listPending(): Promise<PendingRegistration[]> {
  return tx<PendingRegistration[]>('readonly', (s) => s.getAll() as IDBRequest<PendingRegistration[]>)
}

export async function pendingCount(): Promise<number> {
  try {
    return (await listPending()).length
  } catch {
    return 0
  }
}

/**
 * Ask the browser not to evict our IndexedDB under storage pressure.
 *
 * Without this, a phone low on space can silently drop the queue - taking
 * unuploaded trees with it. Chrome grants this automatically for installed
 * PWAs; on other browsers it may prompt or refuse, and refusal is not fatal.
 */
export async function requestDurableStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
