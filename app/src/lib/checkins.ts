/**
 * Submitting a return visit.
 *
 * Shares the photo pipeline, the upload path and the queue with registration -
 * a check-in and a registration differ only in whether a tree row already
 * exists. Keeping them on one code path means blur_score, resize and storage
 * layout mean exactly the same thing in both, which is what makes the pilot data
 * internally comparable.
 */

import { supabase } from './supabase'
import { newCaptureId, photoUrls, uploadPhoto } from './photos'
import { requestScoring } from './ml'
import { haversine } from './geo'
import { DEMO, demoCheckinsFor, demoTrees, demoVerdict } from './demo'
import type { TrunkTaps } from '../components/TrunkMeasure'
import type { Checkin, Tree } from './types'

export interface NearbyTree extends Tree {
  distance_m: number
  last_wide_photo: string | null
  last_wide_url: string | null
  last_captured_at: string | null
}

/**
 * Trees near the user, closest first.
 *
 * GPS narrows the candidates; the PERSON confirms which tree it is against the
 * previous photo. That ordering is the layered-identity model made concrete -
 * we never ask the software to pick the tree on its own, because the spike
 * showed it gets that wrong nearly half the time.
 */
export async function findNearbyTrees(
  userId: string,
  lat: number,
  lng: number,
  radiusM = 100,
): Promise<NearbyTree[]> {
  if (DEMO) {
    return demoTrees.slice(0, 4).map((t, i) => ({
      ...t,
      distance_m: 8 + i * 14,
      last_wide_photo: t.latest?.wide_photo ?? null,
      last_wide_url: t.latest?.wide_photo ?? null,
      last_captured_at: t.latest?.captured_at ?? null,
    }))
  }

  const { data, error } = await supabase
    .from('trees')
    .select(`*, checkins ( wide_photo, captured_at )`)
    .eq('owner_id', userId)
  if (error) throw new Error(error.message)

  type Row = Tree & { checkins: { wide_photo: string; captured_at: string }[] }

  const rows = ((data ?? []) as unknown as Row[])
    .map((row): NearbyTree => {
      const latest = [...(row.checkins ?? [])].sort(
        (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
      )[0]
      const { checkins: _drop, ...tree } = row
      return {
        ...(tree as Tree),
        distance_m: haversine(lat, lng, row.lat, row.lng),
        last_wide_photo: latest?.wide_photo ?? null,
        last_wide_url: null,
        last_captured_at: latest?.captured_at ?? null,
      }
    })
    .filter((t) => t.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m)

  const paths = rows
    .map((r) => r.last_wide_photo)
    .filter((p): p is string => Boolean(p))
  if (paths.length) {
    const urls = await photoUrls(paths)
    for (const r of rows) {
      if (r.last_wide_photo) r.last_wide_url = urls.get(r.last_wide_photo) ?? null
    }
  }
  return rows
}

export async function latestCheckin(treeId: string): Promise<Checkin | null> {
  if (DEMO) {
    const rows = demoCheckinsFor(treeId)
    return rows[rows.length - 1] ?? null
  }

  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('tree_id', treeId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Checkin | null) ?? null
}

export interface CheckinInput {
  userId: string
  treeId: string
  lat: number
  lng: number
  accuracy: number | null
  heading: number | null
  blurScore: number | null
  capturedAt: Date
  wide: Blob
  close: Blob
  trunkTaps: TrunkTaps | null
}

/**
 * Upload both photos, insert the row, ask for scoring.
 *
 * Unlike registration this is NOT queued offline. A check-in is a live,
 * interactive flow - the user is watching the four checks resolve and expects a
 * verdict now. Queuing it would mean showing a verdict screen with nothing to
 * put on it. If the upload fails the user retries on the spot, which is fine
 * because unlike T0 they are not working through a list of forty.
 */
export async function submitCheckin(input: CheckinInput): Promise<string> {
  // Demo mode never uploads and never inserts. waitForVerdict returns a seeded
  // verdict so the reveal screen can be reviewed without a round trip.
  if (DEMO) return 'demo-pending'

  const captureId = newCaptureId()

  const widePath = await uploadPhoto(input.userId, captureId, 'wide', input.wide)
  const closePath = await uploadPhoto(input.userId, captureId, 'close', input.close)

  const { data, error } = await supabase
    .from('checkins')
    .insert({
      tree_id: input.treeId,
      submitted_by: input.userId,
      wide_photo: widePath,
      close_photo: closePath,
      captured_at: input.capturedAt.toISOString(),
      lat: input.lat,
      lng: input.lng,
      gps_accuracy_m: input.accuracy,
      heading_deg: input.heading,
      blur_score: input.blurScore,
      trunk_taps: input.trunkTaps,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Could not save the check-in: ${error.message}`)

  requestScoring(data.id)
  return data.id
}

/**
 * Poll until the service has written a verdict.
 *
 * The row arrives `pending` and only the ML service can move it. Polling the
 * DATABASE rather than trusting the /score response means the UI shows what was
 * actually persisted under service-role - if the two ever disagreed, the
 * database is right.
 */
export async function waitForVerdict(
  checkinId: string,
  timeoutMs = 90_000,
): Promise<Checkin | null> {
  if (DEMO) {
    // A short pause so the "checking" state is visible rather than skipped.
    await new Promise((r) => setTimeout(r, 1400))
    return demoVerdict()
  }

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const { data } = await supabase
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .maybeSingle()
    const row = data as Checkin | null
    if (row && row.verdict !== 'pending') return row
    await new Promise((r) => setTimeout(r, 2500))
  }
  return null
}
