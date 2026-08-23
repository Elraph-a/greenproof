/**
 * Reading trees and their check-ins.
 *
 * Kept out of the components so the same queries feed My Grove, the tree page,
 * the map and (later) the sponsor dashboard without three slightly different
 * versions drifting apart.
 */

import { supabase } from './supabase'
import { photoUrls } from './photos'
import { haversine } from './geo'
import { DEMO, demoCheckinsFor, demoTrees } from './demo'
import type { Checkin, Tree } from './types'

export interface TreeWithLatest extends Tree {
  latest: Pick<
    Checkin,
    'id' | 'wide_photo' | 'close_photo' | 'captured_at' | 'verdict' | 'confidence'
  > | null
  checkin_count: number
}

/** A short human-facing label. The uuid is unusable in the field. */
export function shortId(id: string): string {
  return id.slice(0, 4).toUpperCase()
}

export function treeLabel(tree: Pick<Tree, 'id' | 'tag_code'>): string {
  return tree.tag_code ? `Tree ${tree.tag_code}` : `Tree ${shortId(tree.id)}`
}

export function ageInDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000))
}

export function formatAge(iso: string): string {
  const d = ageInDays(iso)
  if (d === 0) return 'today'
  if (d === 1) return '1 day'
  if (d < 7) return `${d} days`
  const w = Math.floor(d / 7)
  return w === 1 ? '1 week' : `${w} weeks`
}

/** Check-in cadence for the pilot. Overdue is highlighted on My Grove. */
export const CHECKIN_INTERVAL_DAYS = 5

export function nextCheckinDue(lastIso: string): {
  days: number
  overdue: boolean
  label: string
} {
  const since = ageInDays(lastIso)
  const days = CHECKIN_INTERVAL_DAYS - since
  if (days < 0) {
    const n = -days
    return { days, overdue: true, label: `${n} ${n === 1 ? 'day' : 'days'} overdue` }
  }
  if (days === 0) return { days, overdue: true, label: 'Due today' }
  if (days === 1) return { days, overdue: false, label: 'Due tomorrow' }
  return { days, overdue: false, label: `Due in ${days} days` }
}

/**
 * My Grove's list.
 *
 * One query with an embedded child select rather than N+1 — on a phone, forty
 * follow-up requests is several seconds of blank screen. Supabase returns the
 * check-ins nested, and we pick the newest client-side because PostgREST cannot
 * express "latest child per parent" without a view.
 */
export async function listMyTrees(userId: string): Promise<TreeWithLatest[]> {
  if (DEMO) return demoTrees

  const { data, error } = await supabase
    .from('trees')
    .select(
      `*, checkins ( id, wide_photo, close_photo, captured_at, verdict, confidence )`,
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  type Row = Tree & { checkins: TreeWithLatest['latest'][] }
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const sorted = [...(row.checkins ?? [])]
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))
    const { checkins: _drop, ...tree } = row
    return {
      ...(tree as Tree),
      latest: sorted[0] ?? null,
      checkin_count: sorted.length,
    }
  })
}

export async function getTree(id: string): Promise<Tree | null> {
  if (DEMO) return demoTrees.find((t) => t.id === id) ?? null

  const { data, error } = await supabase
    .from('trees')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Tree | null) ?? null
}

/** Full visit history, oldest first — the photo timeline reads left to right. */
export async function listCheckins(treeId: string): Promise<Checkin[]> {
  if (DEMO) return demoCheckinsFor(treeId)

  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('tree_id', treeId)
    .order('captured_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Checkin[]
}

// ---------------------------------------------------------------------------
// Proximity — "is there already a tree here?"
// ---------------------------------------------------------------------------

/**
 * How close an existing tree has to be before we warn.
 *
 * PROVISIONAL, and it must be calibrated against the pilot rather than guessed:
 * compute the nearest-neighbour distance distribution across the 40 registered
 * trees and set this below the 5th percentile. Too wide and every registration
 * in a dense grove warns, users learn to tap through, and the check is worse
 * than useless. Too narrow and a genuine double-registration slips past.
 *
 * 8 m is chosen as a starting point because phone GPS lands within ~5-10 m, so
 * two fixes taken at the SAME trunk can legitimately sit that far apart.
 */
export const PROXIMITY_WARN_M = 8

export interface NearbyRegisteredTree extends Tree {
  distance_m: number
  last_wide_url: string | null
}

/**
 * Trees already registered near a point, closest first — ACROSS ALL OWNERS.
 *
 * Deliberately not scoped to the current user. One physical tree registered by
 * two different people is the double-payment case, and scoping this query to
 * `owner_id` would miss precisely that. `trees readable ... using (true)` in
 * migration 0002 already permits the read, so this needs no new RPC.
 *
 * WHAT THIS IS AND IS NOT. It is a UX guard that stops an honest mistake — the
 * surveyor who walks back to a tree they already did. It is NOT a security
 * gate: it runs on the client and anyone can skip it. The gate that catches a
 * DELIBERATE double-registration has to run server-side, next to the other
 * gates, where the client cannot reach it.
 */
export async function findTreesNear(
  lat: number,
  lng: number,
  radiusM = PROXIMITY_WARN_M,
): Promise<NearbyRegisteredTree[]> {
  // Nothing is really registered in demo mode, so there is nothing to collide
  // with and a warning would be theatre.
  if (DEMO) return []

  // Bounding box first so the database does the elimination. At forty trees
  // this is irrelevant; at forty thousand, pulling every row to the phone to
  // measure it is the difference between instant and unusable.
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180) || 1)

  const { data, error } = await supabase
    .from('trees')
    .select(`*, checkins ( wide_photo, captured_at )`)
    .gte('lat', lat - dLat)
    .lte('lat', lat + dLat)
    .gte('lng', lng - dLng)
    .lte('lng', lng + dLng)
  if (error) throw new Error(error.message)

  type Row = Tree & { checkins: { wide_photo: string; captured_at: string }[] }

  const rows = ((data ?? []) as unknown as Row[])
    .map((row) => {
      const latest = [...(row.checkins ?? [])].sort(
        (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
      )[0]
      const { checkins: _drop, ...tree } = row
      return {
        ...(tree as Tree),
        distance_m: haversine(lat, lng, row.lat, row.lng),
        last_wide_photo: latest?.wide_photo ?? null,
        last_wide_url: null as string | null,
      }
    })
    // The box is a square and the radius is a circle — the corners are further
    // away than radiusM, so the real distance still has to be checked.
    .filter((t) => t.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m)

  // The PHOTO is what actually resolves this. GPS says "something is here";
  // only looking at the previous photo tells the user whether it is this tree.
  const paths = rows
    .map((r) => r.last_wide_photo)
    .filter((p): p is string => Boolean(p))
  if (paths.length) {
    const urls = await photoUrls(paths)
    for (const r of rows) {
      if (r.last_wide_photo) r.last_wide_url = urls.get(r.last_wide_photo) ?? null
    }
  }

  return rows.map(({ last_wide_photo: _p, ...t }) => t)
}
