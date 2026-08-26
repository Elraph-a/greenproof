/**
 * LOCAL DEMO DATA — localhost only, never touches Supabase.
 *
 * Why this exists: exercising a screen needs data, and seeding real data means
 * uploading photos into Supabase Storage. The free allowance is the most likely
 * thing to run out mid-pilot, and burning it on throwaway screenshots would be
 * the worst possible reason to hit the cap. So demo mode reads from here and
 * writes nowhere.
 *
 * Turn on with `VITE_DEMO=1` in app/.env, then restart the dev server (Vite
 * reads env only at startup).
 *
 * SAFETY: every write path checks this flag and refuses. Demo mode cannot
 * create a tree, upload a photo, or move money — if it could, a stray demo
 * build would pollute the pilot data we are about to spend four weeks
 * collecting.
 */

import type {
  Advice,
  Checkin,
  LedgerEntry,
  Profile,
  SpeciesGuess,
  Sponsorship,
} from './types'
import type { TreeWithLatest } from './trees'

export const DEMO = import.meta.env.VITE_DEMO === '1'

/** Photos are served straight from app/public/demo — no signed URLs, no network. */
const P = (n: number) => `/demo/tree${n}.jpg`

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

export const demoUserId = '00000000-0000-4000-8000-000000000001'

export const demoProfile: Profile = {
  id: demoUserId,
  full_name: 'Raphael Mireku',
  phone: '024 000 0000',
  role: 'planter',
  story: 'Planting along the Legon campus perimeter with my hall.',
  photo_path: null,
  created_at: ago(30),
}

/**
 * The sponsor demo identity.
 *
 * WHY THE ROLE FOLLOWS THE ROUTE
 * Demo mode had exactly one profile, a planter, and `Shell` picks its tabs by
 * role - so every sponsor screen rendered with My Grove, Register and Check-in
 * underneath it. A sponsor never does any of those; Shell's own comment says
 * showing them a camera button would be wrong. The sponsor experience could be
 * navigated to but never actually demonstrated.
 *
 * Deriving the role from the path means walking to /sponsor IS being a sponsor,
 * with no toggle to remember and no restart. An env var would have needed the
 * dev server bounced to switch role, which is the wrong property to have on
 * stage; a query string is one more thing to type correctly under pressure.
 *
 * DEMO ONLY. Nothing here runs when VITE_DEMO is unset, and it cannot: a real
 * role comes from `profiles.role`, which no client can write.
 */
export const demoSponsorProfile: Profile = {
  id: '00000000-0000-4000-8000-000000000002',
  full_name: 'Akosua Mensah',
  phone: '024 111 1111',
  role: 'sponsor',
  story: 'Funding the Legon campus perimeter planting on behalf of our alumni fund.',
  photo_path: null,
  created_at: ago(45),
}

export function demoProfileFor(pathname: string): Profile {
  return pathname.startsWith('/sponsor') ? demoSponsorProfile : demoProfile
}

/**
 * Eight trees, matching the reference screen: 4 verified, 1 needing review,
 * 1 flagged, 2 not yet checked. Deliberately NOT all healthy — a grove of
 * uniformly verified trees demonstrates nothing about detecting death, and the
 * screens that matter most are the unhappy ones.
 */
interface Seed {
  n: number
  tag: string
  species: string
  common: string
  verdict: Checkin['verdict'] | null
  confidence: number | null
  status: TreeWithLatest['status']
  lastDays: number
  visits: number
  earned: number
}

const SEEDS: Seed[] = [
  { n: 1, tag: 'GP-0041', species: 'Chlorophora excelsa', common: "Akosua's Odum", verdict: 'verified', confidence: 87, status: 'alive', lastDays: 1, visits: 3, earned: 24 },
  { n: 2, tag: 'GP-0042', species: 'Triplochiton scleroxylon', common: "Kofi's Wawa", verdict: 'review', confidence: 48, status: 'pending', lastDays: 4, visits: 2, earned: 12 },
  { n: 3, tag: 'GP-0043', species: 'Terminalia superba', common: "Ama's Ofram", verdict: 'verified', confidence: 91, status: 'alive', lastDays: 2, visits: 3, earned: 24 },
  { n: 4, tag: 'GP-0044', species: 'Khaya senegalensis', common: "Yaw's Mahogany", verdict: 'verified', confidence: 94, status: 'alive', lastDays: 2, visits: 3, earned: 24 },
  { n: 5, tag: 'GP-0045', species: 'Azadirachta indica', common: "Esi's Neem", verdict: 'flagged', confidence: 21, status: 'flagged', lastDays: 6, visits: 2, earned: 6 },
  { n: 6, tag: 'GP-0046', species: 'Mangifera indica', common: "Kwame's Mango", verdict: 'verified', confidence: 89, status: 'alive', lastDays: 3, visits: 2, earned: 12 },
  // Registered today, awaiting a verdict. ONE visit each, not zero:
  // submitRegistration inserts a `checkins` row alongside the tree, so
  // registration IS visit #1 and a tree with no photograph at all cannot
  // exist. Seeding `visits: 0` modelled an impossible state, and it showed -
  // My Grove's hero picked one of these two, found no photo to display, and
  // fell back to a flat card on the screen whose whole point is the evidence.
  { n: 1, tag: 'GP-0047', species: 'Ceiba pentandra', common: "Abena's Onyina", verdict: null, confidence: null, status: 'pending', lastDays: 0, visits: 1, earned: 0 },
  { n: 3, tag: 'GP-0048', species: 'Milicia regia', common: "Kojo's Odum", verdict: null, confidence: null, status: 'pending', lastDays: 0, visits: 1, earned: 0 },
]

/**
 * Where the eight demo trees stand, as offsets from the campus centre.
 *
 * These were `lat + i * 0.0004, lng + i * 0.0003`, which put every tree on a
 * perfect diagonal - eight pins in a dead straight line, which is the single
 * most obvious way for a map to announce that its data is fake. A hand-picked
 * scatter costs nothing and the map stops looking generated.
 *
 * Fixed values rather than a seeded random: the map is the screen most likely
 * to end up in a screenshot or on a slide, and it should look identical every
 * time it is opened. Closest pair is 21 m and the whole grove spans 130 m, so
 * no two pins overlap at the zoom this screen opens at.
 */
const SPREAD: readonly (readonly [number, number])[] = [
  [0.00042, -0.00031],
  [-0.00018, 0.00055],
  [0.00061, 0.00024],
  [-0.00047, -0.00012],
  [0.00009, 0.00038],
  [-0.00035, 0.00047],
  [0.00028, 0.00062],
  [-0.00056, 0.00029],
]

export const demoTrees: TreeWithLatest[] = SEEDS.map((s, i) => ({
  id: `demo-tree-${i + 1}`,
  tag_code: s.tag,
  species: s.species,
  planted_estimate: null,
  plot_id: 'demo-plot',
  owner_id: demoUserId,
  registered_by: demoUserId,
  lat: 5.6505 + (SPREAD[i]?.[0] ?? 0),
  lng: -0.1962 + (SPREAD[i]?.[1] ?? 0),
  heading_deg: 23 + i * 17,
  status: s.status,
  current_confidence: s.confidence,
  created_at: ago(21 - i),
  latest:
    s.visits === 0
      ? null
      : {
          id: `demo-checkin-${i + 1}`,
          wide_photo: P(s.n),
          close_photo: P(((s.n + 2) % 6) + 1),
          captured_at: ago(s.lastDays),
          verdict: s.verdict ?? 'pending',
          confidence: s.confidence,
        },
  checkin_count: s.visits,
}))

/** Common name for a demo tree, used where the designs show one. */
export const demoCommonName = new Map(
  SEEDS.map((s, i) => [`demo-tree-${i + 1}`, s.common]),
)

/** Per-tree earnings, so the amber money chip on each card has a real value. */
export const demoEarnings = new Map(
  SEEDS.map((s, i) => [`demo-tree-${i + 1}`, s.earned]),
)

/* Sorted newest-first to match the real query's `.order('created_at',
   { ascending: false })` — an unordered ledger is the fastest way for a demo
   to read as fake. ISO timestamps compare correctly as strings. */
export const demoLedger: LedgerEntry[] = SEEDS.flatMap((s, i) =>
  s.earned === 0
    ? []
    : [
        {
          id: `demo-ledger-${i + 1}`,
          user_id: demoUserId,
          tree_id: `demo-tree-${i + 1}`,
          amount_ghs: s.earned,
          reason: `checkin_demo-checkin-${i + 1}`,
          status: 'accrued',
          batch_id: null,
          created_at: ago(s.lastDays),
        },
      ],
).sort((a, b) => b.created_at.localeCompare(a.created_at))

/** Full visit history for one tree — the photo timeline on the detail screen. */
export function demoCheckinsFor(treeId: string): Checkin[] {
  const idx = Number(treeId.replace('demo-tree-', '')) || 1
  const seed = SEEDS[idx - 1]
  if (!seed || seed.visits === 0) return []
  return Array.from({ length: seed.visits }, (_, k) => {
    /*
     * Photos are indexed BACKWARDS from the latest visit, so visit N always
     * lands on P(seed.n) - the same photo `demoTrees[i].latest.wide_photo`
     * claims.
     *
     * It used to index forwards from k, so the two disagreed: My Grove showed
     * one photograph as the tree's most recent evidence and the tree page
     * showed a different one for the same visit. On any other screen that is a
     * cosmetic mismatch. Here it undermines the product's central claim, which
     * is that a tree's identity is a consistent chain of photographs.
     */
    const back = seed.visits - 1 - k
    return {
    id: `demo-checkin-${idx}-${k}`,
    tree_id: treeId,
    submitted_by: demoUserId,
    wide_photo: P(((seed.n - 1 + back) % 6) + 1),
    close_photo: P(((seed.n + 1 + back) % 6) + 1),
    tag_photo: null,
    leaf_photo: null,
    captured_at: ago(seed.lastDays + (seed.visits - 1 - k) * 5),
    server_received_at: ago(seed.lastDays + (seed.visits - 1 - k) * 5),
    lat: 5.6505,
    lng: -0.1962,
    gps_accuracy_m: 6.7,
    heading_deg: 23,
    blur_score: 82,
    trunk_taps: null,
    phash: null,
    confidence: k === seed.visits - 1 ? seed.confidence : 90,
    verdict: k === seed.visits - 1 ? (seed.verdict ?? 'pending') : 'verified',
    signals: {
      gates: {
        duplicate_image: { passed: true, nearest_phash_distance: 22 },
        gps_radius: { passed: true, distance_m: 4, allowed_m: 10 },
        travel_speed: { passed: true, kmh: 3.2 },
      },
      scores: {
        location: { score: 96, distance_m: 4 },
        liveness: { score: 88, excess_green: 0.34 },
        scene_match: { score: 94, cosine_wide: 0.71, cosine_close: 0.66 },
        growth: { score: 81, trunk_mm: 256, delta_mm: 21 },
      },
      model: { name: 'dinov2-vits14', version: 'demo' },
    },
    audit_sample: false,
    reviewed_by: null,
    reviewed_at: null,
    /*
     * ADVISORY FIXTURES. Only on the LATEST visit, because that is where the
     * app shows advice and because a tree carrying identical advice on every
     * historical visit would look fabricated to anyone scrolling the timeline.
     *
     * CLAUDE.md: "Every screen needs a DEMO branch. MapScreen and
     * SponsorDashboard were both missed and both rendered 'permission denied
     * for table trees' in front of an audience." The advice card is a new
     * screen region and gets the same treatment before it ever reaches a stage.
     */
    species_guess: k === seed.visits - 1 ? demoSpecies(seed) : null,
    advice: k === seed.visits - 1 ? demoAdvice(seed) : null,
    }
  })
}

/**
 * Demo advice, varied by the seed's condition.
 *
 * The struggling tree gets genuinely different guidance from the healthy one.
 * A demo where every tree returns the same cheerful paragraph teaches a judge
 * that the feature is a template, which is the opposite of the point.
 */
function demoAdvice(seed: Seed): Advice {
  const declining = seed.status === 'flagged' || (seed.confidence ?? 100) < 60
  return declining
    ? {
        health: 'stressed',
        observations: [
          'Leaf tips are browning on the lower branches, and several leaves have dropped.',
          'The soil around the base looks compacted and dry.',
          'Grass is growing right up to the trunk and competing for water.',
        ],
        actions: [
          'Water deeply twice a week rather than lightly every day - deep watering pushes roots down.',
          'Clear grass and weeds in a circle about one metre around the trunk.',
          'Lay dry leaves or straw as mulch over that cleared circle, keeping it clear of the trunk itself.',
        ],
        limitations:
          'The photographs cannot show root condition, soil depth, or whether the browning is drought or a pest. Check the underside of a few leaves for insects in person.',
        model: 'gemini-2.5-flash',
        advisory_only: true,
      }
    : {
        health: 'healthy',
        observations: [
          'Full, evenly green canopy with new growth visible at the branch tips.',
          'The trunk is straight and the bark is undamaged.',
        ],
        actions: [
          'Keep the base clear of competing grass.',
          'Continue watering through the dry spell; this one needs no intervention.',
        ],
        limitations:
          'A photograph cannot show root health or soil moisture below the surface. Nothing visible here suggests a problem.',
        model: 'gemini-2.5-flash',
        advisory_only: true,
      }
}

function demoSpecies(seed: Seed): SpeciesGuess {
  return {
    common: seed.common.split("'s ")[1] ?? seed.common,
    scientific: seed.species,
    // Not 1.0, deliberately. A demo that shows perfect confidence in a species
    // call teaches the wrong thing about a signal that is genuinely uncertain.
    self_reported_confidence: 0.82,
    model: 'gemini-2.5-flash',
  }
}

/**
 * The verdict a demo check-in returns. Deliberately a PASS with a visible
 * margin rather than a perfect score — 87% with three named checks is what the
 * reveal screen is designed to explain, and a 100% result teaches nobody
 * anything about how the system decides.
 */
export function demoVerdict(): Checkin {
  const base = demoCheckinsFor('demo-tree-1')
  const last = base[base.length - 1]!
  return {
    ...last,
    id: 'demo-fresh-checkin',
    captured_at: new Date().toISOString(),
    server_received_at: new Date().toISOString(),
    confidence: 87,
    verdict: 'verified',
    signals: {
      gates: {
        duplicate_image: { passed: true, nearest_phash_distance: 24 },
        gps_radius: { passed: true, distance_m: 4, allowed_m: 10 },
        travel_speed: { passed: true, kmh: 2.8 },
      },
      scores: {
        location: { score: 96, distance_m: 4 },
        liveness: { score: 88, excess_green: 0.34 },
        scene_match: { score: 94, cosine_wide: 0.71, cosine_close: 0.66 },
        growth: { score: 81, trunk_mm: 256, delta_mm: 21 },
      },
      weights: { location: 0.25, liveness: 0.2, scene_match: 0.35, growth: 0.2 },
      model: { name: 'dinov2-vits14', version: 'demo' },
    },
  }
}

/**
 * Mutable in demo mode so "fund a grove" can be walked through and the
 * portfolio updates. Never persisted.
 */
/*
 * Owned by the SPONSOR, not the planter.
 *
 * It was seeded against demoUserId, and once credits arrived the planter's
 * wallet read that GH₵88 sponsor pledge as the planter's own redemption -
 * "88 put back into trees" for something a sponsor had pledged. Redemptions
 * are identified by author (see lib/credits.ts), so the fixture has to belong
 * to whoever actually made it.
 */
export const demoSponsorships: Sponsorship[] = [
  {
    id: 'demo-sp-1',
    sponsor_id: demoSponsorProfile.id,
    plot_id: '00000000-0000-4000-9000-000000000001',
    trees_committed: 8,
    amount_ghs: 88,
    status: 'paid',
    momo_ref: 'MOCK-SEED0001',
    created_at: ago(21),
  },
]

export const demoLeaderboard = [
  { id: 'g1', name: 'Legon Hall', kind: 'school', trees: 128, alive: 119, survival_pct: 93.0 },
  { id: 'g2', name: 'Christ the King Youth', kind: 'church', trees: 96, alive: 84, survival_pct: 87.5 },
  { id: 'g3', name: 'Madina Community', kind: 'community', trees: 74, alive: 61, survival_pct: 82.4 },
  { id: 'g4', name: 'Akuafo Hall', kind: 'school', trees: 52, alive: 39, survival_pct: 75.0 },
]

/** Guard for any write path. Demo mode is read-only, by construction. */
export function refuseWriteInDemo(what: string): never {
  throw new Error(
    `Demo mode is read-only - ${what} is disabled so demo data can never reach Supabase.`,
  )
}
