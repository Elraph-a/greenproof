/**
 * Submitting a registration, durably.
 *
 * Registration IS check-in number one: the schema has no photo columns on
 * `trees`, and that is correct — a tree's evidence lives in its chain of visits,
 * and the first visit is not special. It also means the T0 photos are scored by
 * exactly the same pipeline as every later round, with no separate code path to
 * keep in sync.
 *
 * The write is a three-step transaction we cannot make atomic from a browser:
 *
 *   1. upload wide + close photos to Storage
 *   2. insert the `trees` row
 *   3. insert the `checkins` row referencing both
 *
 * Any step can fail on a bad connection. So each step records its result back
 * into the IndexedDB queue item before the next begins, and a retry resumes from
 * where it stopped rather than restarting.
 */

import { supabase } from './supabase'
import { newCaptureId, uploadPhoto } from './photos'
import { requestScoring } from './ml'
import type { TrunkTaps } from '../components/TrunkMeasure'
import {
  dequeue,
  enqueue,
  listPending,
  newPendingId,
  update,
  type PendingRegistration,
} from './queue'

export interface RegistrationInput {
  userId: string
  species: string | null
  tagCode: string | null
  lat: number
  lng: number
  accuracy: number | null
  heading: number | null
  blurScore: number | null
  capturedAt: Date
  wide: Blob
  close: Blob
  /**
   * Foliage close-up for the advisory layer. The capture flow now REQUIRES it,
   * but this stays optional at the type level on purpose - see the upload note
   * in send(), and note that queue items written before this field existed have
   * it undefined.
   */
  leaf?: Blob | null
  /**
   * Optional. At T0 only a sample of trees is physically measured, so most
   * registrations carry null — the tree still registers and the visit still
   * counts, the growth check simply has no baseline for that tree.
   */
  trunkTaps: TrunkTaps | null
}

/**
 * Persist to IndexedDB, then attempt to send.
 *
 * Returns as soon as the item is durably queued — deliberately BEFORE the
 * network attempt finishes. Standing at tree 12 of 40, the user should be able
 * to walk to tree 13 while tree 12 uploads in the background. Making them watch
 * a spinner forty times is what turns a one-hour T0 into a three-hour one.
 */
export async function submitRegistration(
  input: RegistrationInput,
): Promise<{ queuedId: string }> {
  const item: PendingRegistration = {
    id: newPendingId(),
    captureId: newCaptureId(),
    userId: input.userId,
    createdAt: Date.now(),
    attempts: 0,
    tree: {
      species: input.species,
      tag_code: input.tagCode,
      lat: input.lat,
      lng: input.lng,
      heading_deg: input.heading,
    },
    checkin: {
      captured_at: input.capturedAt.toISOString(),
      lat: input.lat,
      lng: input.lng,
      gps_accuracy_m: input.accuracy,
      heading_deg: input.heading,
      blur_score: input.blurScore,
      trunk_taps: input.trunkTaps,
    },
    photos: {
      wide: input.wide,
      close: input.close,
      // Only stored when actually captured. `undefined` rather than `null`
      // keeps items identical in shape to those queued before this existed.
      ...(input.leaf ? { leaf: input.leaf } : {}),
    },
    uploaded: {},
  }

  await enqueue(item)
  // Fire and forget — the queue is the source of truth from here on.
  void flushQueue()
  return { queuedId: item.id }
}

/** Push one queued registration as far as it will go. Throws on failure. */
async function send(item: PendingRegistration): Promise<void> {
  // --- 1. photos -----------------------------------------------------------
  if (!item.uploaded.wide) {
    item.uploaded.wide = await uploadPhoto(
      item.userId,
      item.captureId,
      'wide',
      item.photos.wide,
    )
    await update(item)
  }
  if (!item.uploaded.close) {
    item.uploaded.close = await uploadPhoto(
      item.userId,
      item.captureId,
      'close',
      item.photos.close,
    )
    await update(item)
  }

  // REQUIRED TO CAPTURE, TOLERANT ON UPLOAD - and the difference is deliberate.
  //
  // The capture flow will not let you past the leaf step, because advice from a
  // whole-tree shot and a piece of bark is much weaker than advice from a leaf.
  // But once the photo has been taken, the planter has done what was asked, and
  // a failed upload of an ADVISORY photo must not cost them the registration and
  // the payment that follows it. The other two photos are evidence; this one
  // feeds guidance nobody is paid on.
  //
  // So it uploads last and its failure is swallowed. Degrade, don't break.
  if (item.photos.leaf && !item.uploaded.leaf) {
    try {
      item.uploaded.leaf = await uploadPhoto(
        item.userId,
        item.captureId,
        'leaf',
        item.photos.leaf,
      )
      await update(item)
    } catch {
      /* advisory only - the visit proceeds without it */
    }
  }

  // --- 2. tree -------------------------------------------------------------
  if (!item.treeId) {
    const { data, error } = await supabase
      .from('trees')
      .insert({
        species: item.tree.species,
        tag_code: item.tree.tag_code,
        lat: item.tree.lat,
        lng: item.tree.lng,
        heading_deg: item.tree.heading_deg,
        owner_id: item.userId,
        registered_by: item.userId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Could not save the tree: ${error.message}`)
    item.treeId = data.id
    await update(item)
  }

  // --- 3. check-in ---------------------------------------------------------
  const { data: created, error } = await supabase.from('checkins').insert({
    tree_id: item.treeId,
    submitted_by: item.userId,
    wide_photo: item.uploaded.wide!,
    close_photo: item.uploaded.close!,
    captured_at: item.checkin.captured_at,
    lat: item.checkin.lat,
    lng: item.checkin.lng,
    gps_accuracy_m: item.checkin.gps_accuracy_m,
    heading_deg: item.checkin.heading_deg,
    blur_score: item.checkin.blur_score,
    // ?? null so items queued before this field existed insert cleanly.
    trunk_taps: item.checkin.trunk_taps ?? null,
    leaf_photo: item.uploaded.leaf ?? null,
  }).select('id').single()
  if (error) throw new Error(`Could not save the first check-in: ${error.message}`)

  await dequeue(item.id)

  // Ask for scoring, but never depend on it. A failure here leaves the row
  // `pending`, which is the correct and safe state — /backfill collects it.
  if (created?.id) requestScoring(created.id)
}

let flushing = false

/**
 * Drain the queue.
 *
 * Serial, not parallel: forty simultaneous uploads on a congested mobile
 * connection is how you get forty timeouts. One at a time is slower in theory
 * and far more likely to finish in practice.
 */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 }
  if (!navigator.onLine) return { sent: 0, failed: 0 }

  flushing = true
  let sent = 0
  let failed = 0
  try {
    const pending = await listPending()
    for (const item of pending.sort((a, b) => a.createdAt - b.createdAt)) {
      try {
        await send(item)
        sent++
      } catch (err) {
        failed++
        item.attempts++
        item.lastError = err instanceof Error ? err.message : String(err)
        await update(item)
        // Stop on first failure. If the connection has gone, the remaining
        // items will fail identically and each failure costs a real timeout.
        if (!navigator.onLine) break
      }
    }
  } finally {
    flushing = false
  }
  return { sent, failed }
}

/** Retry whenever the phone regains signal, and shortly after boot. */
export function startQueueWatcher(): () => void {
  const onOnline = () => void flushQueue()
  window.addEventListener('online', onOnline)

  // Some Android browsers report onLine optimistically after a network change,
  // so also poll gently. 30 s is invisible to the user and cheap.
  const timer = window.setInterval(() => void flushQueue(), 30_000)
  void flushQueue()

  return () => {
    window.removeEventListener('online', onOnline)
    window.clearInterval(timer)
  }
}
