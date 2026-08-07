/**
 * The sponsor's data.
 *
 * A sponsor sees the whole pilot rather than only trees explicitly assigned to
 * them. That is a PILOT SIMPLIFICATION and it is deliberate: trees registered
 * at T0 carry no plot, so a strictly-scoped view would open empty and prove
 * nothing. In production this becomes "trees in plots I have funded" — one
 * `where` clause, already modelled by sponsorships.plot_id.
 *
 * Say that plainly if asked. The interesting claim is not which trees are
 * shown, it is that every figure on the sponsor screen is derived from
 * verification the sponsor did not perform and cannot influence.
 */

import { supabase } from './supabase'
import { DEMO, demoLedger, demoSponsorships, demoTrees } from './demo'
import { photoUrls } from './photos'
import type { Sponsorship } from './types'

export const PILOT_PLOT_ID = '00000000-0000-4000-9000-000000000001'

export interface SponsorPortfolio {
  trees: number
  alive: number
  flagged: number
  survivalPct: number
  /** Actually paid out to planters — trigger-written, never client-written. */
  paidOutGhs: number
  /** Pledged by this sponsor. A pledge is not evidence a tree survived. */
  committedGhs: number
  committedTrees: number
  costPerSurvivingGhs: number
  /** Distinct trees confirmed alive per check-in round. */
  curve: { date: string; alive: number; total: number }[]
  recent: { id: string; treeId: string; url: string; capturedAt: string; confidence: number | null }[]
}

export async function loadPortfolio(userId: string): Promise<SponsorPortfolio> {
  if (DEMO) return demoPortfolio()

  const [{ data: trees, error: te }, { data: checkins }, { data: led }, { data: sp }] =
    await Promise.all([
      supabase.from('trees').select('id, status, created_at'),
      supabase
        .from('checkins')
        .select('id, tree_id, wide_photo, captured_at, confidence, verdict')
        .eq('verdict', 'verified')
        .order('captured_at', { ascending: false })
        .limit(200),
      supabase.from('ledger_entries').select('amount_ghs'),
      supabase.from('sponsorships').select('*').eq('sponsor_id', userId),
    ])

  if (te) throw new Error(te.message)

  const rows = trees ?? []
  const alive = rows.filter((t) => t.status === 'alive').length
  const flagged = rows.filter((t) => t.status === 'flagged').length
  const paidOut = (led ?? []).reduce((s, e) => s + Number(e.amount_ghs ?? 0), 0)
  const pledges = (sp ?? []) as unknown as Sponsorship[]

  const verified = (checkins ?? []) as unknown as {
    id: string
    tree_id: string
    wide_photo: string
    captured_at: string
    confidence: number | null
  }[]

  const byDay = new Map<string, Set<string>>()
  for (const row of verified) {
    const day = row.captured_at.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, new Set())
    byDay.get(day)!.add(row.tree_id)
  }

  const top = verified.slice(0, 12)
  const urls = top.length ? await photoUrls(top.map((r) => r.wide_photo)) : new Map()

  return {
    trees: rows.length,
    alive,
    flagged,
    survivalPct: rows.length ? (alive / rows.length) * 100 : 0,
    paidOutGhs: paidOut,
    committedGhs: pledges.reduce((s, p) => s + Number(p.amount_ghs), 0),
    committedTrees: pledges.reduce((s, p) => s + p.trees_committed, 0),
    costPerSurvivingGhs: alive ? paidOut / alive : 0,
    curve: [...byDay.entries()]
      .map(([date, set]) => ({ date, alive: set.size, total: rows.length }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recent: top.map((r) => ({
      id: r.id,
      treeId: r.tree_id,
      url: urls.get(r.wide_photo) ?? '',
      capturedAt: r.captured_at,
      confidence: r.confidence,
    })),
  }
}

export async function createSponsorship(
  userId: string,
  treesCommitted: number,
  amountGhs: number,
): Promise<void> {
  if (DEMO) {
    demoSponsorships.push({
      id: `demo-sp-${demoSponsorships.length + 1}`,
      sponsor_id: userId,
      plot_id: PILOT_PLOT_ID,
      trees_committed: treesCommitted,
      amount_ghs: amountGhs,
      status: 'pledged',
      momo_ref: null,
      created_at: new Date().toISOString(),
    })
    return
  }

  const { error } = await supabase.from('sponsorships').insert({
    sponsor_id: userId,
    plot_id: PILOT_PLOT_ID,
    trees_committed: treesCommitted,
    amount_ghs: amountGhs,
  })
  if (error) throw new Error(error.message)
}

/* -------------------------------------------------------------------------- */

function demoPortfolio(): SponsorPortfolio {
  const alive = demoTrees.filter((t) => t.status === 'alive').length
  const flagged = demoTrees.filter((t) => t.status === 'flagged').length
  const paidOut = demoLedger.reduce((s, e) => s + Number(e.amount_ghs), 0)
  const day = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

  return {
    trees: demoTrees.length,
    alive,
    flagged,
    survivalPct: (alive / demoTrees.length) * 100,
    paidOutGhs: paidOut,
    committedGhs: demoSponsorships.reduce((s, p) => s + Number(p.amount_ghs), 0),
    committedTrees: demoSponsorships.reduce((s, p) => s + p.trees_committed, 0),
    costPerSurvivingGhs: alive ? paidOut / alive : 0,
    curve: [
      { date: day(21), alive: 8, total: 8 },
      { date: day(15), alive: 7, total: 8 },
      { date: day(9), alive: 6, total: 8 },
      { date: day(3), alive: 4, total: 8 },
    ],
    recent: demoTrees
      .filter((t) => t.latest)
      // Newest first, matching the real query — the photo wall showing
      // 6 Aug, 3 Aug, 5 Aug in that order reads as broken.
      .sort((a, b) => b.latest!.captured_at.localeCompare(a.latest!.captured_at))
      .slice(0, 8)
      .map((t) => ({
        id: t.latest!.id,
        treeId: t.id,
        url: t.latest!.wide_photo,
        capturedAt: t.latest!.captured_at,
        confidence: t.latest!.confidence,
      })),
  }
}
