/**
 * Hand-written to mirror supabase/migrations/*.sql.
 *
 * Insert types deliberately omit every column the client is not GRANTed, so
 * attempting to write `verdict` or `confidence` is a compile error here rather
 * than a silent permission failure at runtime. The database is still the real
 * enforcement — this just moves the mistake to the earliest possible moment.
 */

export type TreeStatus = 'pending' | 'alive' | 'flagged' | 'dead'
export type CheckinVerdict = 'pending' | 'verified' | 'review' | 'flagged'
export type UserRole = 'planter' | 'institution' | 'sponsor' | 'reviewer'

export type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  role: UserRole
  story: string | null
  photo_path: string | null
  created_at: string
}

export type Tree = {
  id: string
  tag_code: string | null
  species: string | null
  planted_estimate: string | null
  plot_id: string | null
  owner_id: string
  registered_by: string
  lat: number
  lng: number
  heading_deg: number | null
  status: TreeStatus
  current_confidence: number | null
  created_at: string
}

/** Only the columns granted by `grant insert (...) on trees to authenticated`. */
export type TreeInsert = {
  tag_code?: string | null
  species?: string | null
  planted_estimate?: string | null
  plot_id?: string | null
  owner_id: string
  registered_by: string
  lat: number
  lng: number
  heading_deg?: number | null
}

export type Checkin = {
  id: string
  tree_id: string
  submitted_by: string
  wide_photo: string
  close_photo: string
  tag_photo: string | null
  captured_at: string
  server_received_at: string
  lat: number
  lng: number
  gps_accuracy_m: number | null
  heading_deg: number | null
  blur_score: number | null
  /** Normalised trunk-edge taps. The SERVER turns these into millimetres. */
  trunk_taps: { left: { x: number; y: number }; right: { x: number; y: number } } | null
  phash: string | null
  confidence: number | null
  verdict: CheckinVerdict
  signals: Signals | null
  audit_sample: boolean
  reviewed_by: string | null
  reviewed_at: string | null
}

/** Only the columns granted by `grant insert (...) on checkins to authenticated`. */
export type CheckinInsert = {
  tree_id: string
  submitted_by: string
  wide_photo: string
  close_photo: string
  tag_photo?: string | null
  captured_at: string
  lat: number
  lng: number
  gps_accuracy_m?: number | null
  heading_deg?: number | null
  blur_score?: number | null
  trunk_taps?: {
    left: { x: number; y: number }
    right: { x: number; y: number }
  } | null
}

/**
 * The per-signal breakdown written by the ML service.
 *
 * NEVER collapse this to a single number. It is three things at once: the
 * debugging tool, the Q&A teaching aid, and the data behind the progressive
 * signal reveal in the check-in UI.
 *
 * `gates` run BEFORE scoring and are disqualifying on their own.
 */
export type Signals = {
  gates?: {
    duplicate_image?: { passed: boolean; nearest_phash_distance?: number; matched_checkin?: string }
    gps_radius?: { passed: boolean; distance_m?: number; allowed_m?: number }
    travel_speed?: { passed: boolean; kmh?: number; from_checkin?: string }
  }
  scores?: {
    location?: { score: number; distance_m?: number }
    liveness?: { score: number; excess_green?: number }
    scene_match?: { score: number; cosine_wide?: number; cosine_close?: number; orb_inliers?: number }
    growth?: { score: number; trunk_mm?: number; delta_mm?: number; canopy_frac?: number }
  }
  weights?: Record<string, number>
  model?: { name: string; version: string }
  /** Set when this row is a deliberately-injected known-bad check-in. */
  self_test?: { injected: true; attack_type: string; expected_verdict: CheckinVerdict }
}

export type LedgerEntry = {
  id: string
  user_id: string
  tree_id: string | null
  amount_ghs: number
  reason: string
  status: string
  batch_id: string | null
  created_at: string
}

export type Group = {
  id: string
  name: string
  kind: string
  created_at: string
}

export type Sponsorship = {
  id: string
  sponsor_id: string
  plot_id: string | null
  trees_committed: number
  amount_ghs: number
  status: string
  momo_ref: string | null
  created_at: string
}

/** Only the columns granted by `grant insert (...) on sponsorships`. */
export type SponsorshipInsert = {
  sponsor_id: string
  plot_id?: string | null
  trees_committed: number
  amount_ghs: number
}

/**
 * One row of runtime configuration. See migration 0010.
 *
 * A `type` and not an `interface`, like every other Row here. An interface has
 * no implicit index signature, so it fails the Database generic's constraint
 * and collapses EVERY table's types to `never` — an error that surfaces
 * hundreds of lines away from the cause.
 */
export type AppConfigRow = {
  key: string
  value: string
  updated_at: string
}

export type ReviewQueueRow = Checkin & {
  tag_code: string | null
  species: string | null
  tree_lat: number
  tree_lng: number
  is_audit: boolean
}

export type LeaderboardRow = {
  id: string
  name: string
  kind: string
  trees: number
  alive: number
  survival_pct: number | null
}

export type PlotSurvivalRow = {
  plot_id: string
  plot_name: string
  sponsor_id: string | null
  trees: number
  alive: number
  flagged: number
  mean_confidence: number | null
}

/**
 * Shape for the supabase-js generic. Expanded as features land.
 *
 * `Relationships: []` on every table is required, not decorative: supabase-js
 * structurally matches this against its internal GenericSchema, and if ANY part
 * fails to match it silently falls back to a permissive default where
 * `.insert()` is typed `never[]`. The failure mode is that every insert in the
 * app becomes a type error with a misleading message, which is exactly what
 * happened the first time this file was written.
 *
 * `Update: Record<string, never>` on checkins encodes "clients never update a
 * check-in" — there is no update RLS policy for it, so this makes the database's
 * rule visible in the type system rather than discovered at runtime.
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string }
        Update: Partial<Profile>
        Relationships: []
      }
      trees: {
        Row: Tree
        Insert: TreeInsert
        Update: Partial<TreeInsert>
        Relationships: []
      }
      checkins: {
        Row: Checkin
        Insert: CheckinInsert
        Update: Record<string, never>
        Relationships: []
      }
      ledger_entries: {
        Row: LedgerEntry
        // No client insert. Money appears ONLY via the accrue_on_verified
        // trigger on a verified check-in — see migration 0007. You cannot pay
        // yourself; you can only pass verification.
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      groups: {
        Row: Group
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      sponsorships: {
        Row: Sponsorship
        Insert: SponsorshipInsert
        // `status` and `momo_ref` are not granted — a client cannot mark its
        // own pledge paid. See migration 0009.
        Update: Record<string, never>
        Relationships: []
      }
      app_config: {
        Row: AppConfigRow
        // Read-only to clients. No insert/update/delete is granted at all, so
        // the scoring URL can only be changed with the service key. See
        // migration 0010.
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: {
      review_queue: { Row: ReviewQueueRow; Relationships: [] }
      group_leaderboard: { Row: LeaderboardRow; Relationships: [] }
      plot_survival: { Row: PlotSurvivalRow; Relationships: [] }
    }
    Functions: {
      /**
       * The one narrow doorway through which a human verdict may be written.
       * SECURITY DEFINER, checks the caller is a reviewer. See migration 0006.
       */
      review_checkin: {
        Args: {
          p_checkin_id: string
          p_verdict: 'verified' | 'flagged'
          p_note?: string | null
        }
        Returns: Checkin
      }
      /**
       * The only way a client may change its own role, and it accepts just the
       * two self-service values. `reviewer` is administrative — see 0009.
       */
      set_my_role: {
        Args: { p_role: UserRole }
        Returns: Profile
      }
    }
    Enums: {
      tree_status: TreeStatus
      checkin_verdict: CheckinVerdict
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
