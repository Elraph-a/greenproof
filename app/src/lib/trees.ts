/**
 * Reading trees and their check-ins.
 *
 * Kept out of the components so the same queries feed My Grove, the tree page,
 * the map and (later) the sponsor dashboard without three slightly different
 * versions drifting apart.
 */

import { supabase } from './supabase'
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
  if (days < 0) return { days, overdue: true, label: `${-days} days overdue` }
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
