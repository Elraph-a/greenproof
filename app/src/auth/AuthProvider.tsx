import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { DEMO, demoProfile, demoUserId } from '../lib/demo'
import type { Profile } from '../lib/types'

/**
 * A stand-in session for demo mode. Only the fields the app actually reads are
 * populated — this is never passed to Supabase, it exists so `RequireAuth` and
 * the `session ? …` redirects behave as they do when signed in.
 */
const demoSession = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: demoUserId, email: 'demo@greenproof.local' },
} as unknown as Session

interface AuthValue {
  session: Session | null
  profile: Profile | null
  userId: string | null
  /** True until the initial session lookup resolves — avoids a login flash. */
  loading: boolean
  signIn: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  saveProfile: (patch: Partial<Profile>) => Promise<void>
  /**
   * Role goes through a SECURITY DEFINER function, not an update, because
   * `profiles.role` is no longer client-writable — a user who could set it
   * to 'reviewer' could decide verdicts, including their own. See 0009.
   */
  setRole: (role: 'planter' | 'sponsor') => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(DEMO ? demoSession : null)
  const [profile, setProfile] = useState<Profile | null>(DEMO ? demoProfile : null)
  const [loading, setLoading] = useState(!DEMO)

  const userId = session?.user.id ?? null

  const loadProfile = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (data) {
      setProfile(data as Profile)
      return
    }

    // Belt and braces. 0004_profile_trigger.sql creates this row automatically,
    // but a tree insert fails with a foreign-key error if the profile is
    // missing — and discovering that outdoors with 40 trees to register is not
    // a debugging session anyone wants. Insert is permitted by the
    // "own profile insert" RLS policy (auth.uid() = id).
    const { data: created } = await supabase
      .from('profiles')
      .insert({ id })
      .select('*')
      .maybeSingle()
    if (created) setProfile(created as Profile)
  }, [])

  useEffect(() => {
    if (DEMO) return // no Supabase session to watch
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (DEMO) return
    if (userId) void loadProfile(userId)
    else setProfile(null)
  }, [userId, loadProfile])

  const signIn = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId)
  }, [userId, loadProfile])

  const saveProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (DEMO) {
        setProfile((p) => (p ? { ...p, ...patch } : p))
        return
      }
      if (!userId) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (data) setProfile(data as Profile)
    },
    [userId],
  )

  const setRole = useCallback(async (role: 'planter' | 'sponsor') => {
    if (DEMO) {
      setProfile((p) => (p ? { ...p, role } : p))
      return
    }
    const { data, error } = await supabase.rpc('set_my_role', { p_role: role })
    if (error) throw new Error(error.message)
    if (data) setProfile(data as unknown as Profile)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      userId,
      loading,
      signIn,
      signOut,
      refreshProfile,
      saveProfile,
      setRole,
    }),
    [
      session,
      profile,
      userId,
      loading,
      signIn,
      signOut,
      refreshProfile,
      saveProfile,
      setRole,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
