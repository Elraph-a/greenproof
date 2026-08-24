import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { DEMO, demoProfile, demoUserId } from '../lib/demo'
import type { Profile } from '../lib/types'

/**
 * A stand-in session for demo mode. Only the fields the app actually reads are
 * populated - this is never passed to Supabase, it exists so `RequireAuth` and
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
  /** True until the initial session lookup resolves - avoids a login flash. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  /**
   * Creates the account AND writes name/phone/role in one call. It has to be
   * one call: the moment signUp succeeds the router sees a session and starts
   * redirecting, so any work left to the screen after that point is running
   * inside a component that is about to unmount.
   */
  signUp: (
    email: string,
    password: string,
    details: { fullName: string; phone: string; role: 'planter' | 'sponsor' },
  ) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  saveProfile: (patch: Partial<Profile>) => Promise<void>
  /**
   * Role goes through a SECURITY DEFINER function, not an update, because
   * `profiles.role` is no longer client-writable - a user who could set it
   * to 'reviewer' could decide verdicts, including their own. See 0009.
   */
  setRole: (role: 'planter' | 'sponsor') => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(DEMO ? demoSession : null)
  const [profile, setProfile] = useState<Profile | null>(DEMO ? demoProfile : null)
  const [loading, setLoading] = useState(!DEMO)

  /**
   * True while signUp is writing the profile. The instant the session appears,
   * the userId effect below fires loadProfile - which would race the writes in
   * signUp and could clobber the just-saved name/role with the trigger's empty
   * row. While this is set, signUp owns the profile state.
   */
  const signingUp = useRef(false)

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
    // missing - and discovering that outdoors with 40 trees to register is not
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
    if (signingUp.current) return // signUp writes the profile itself
    if (userId) void loadProfile(userId)
    else setProfile(null)
  }, [userId, loadProfile])

  /**
   * Email + password, deliberately, after magic links failed in the field.
   *
   * A magic link is only as good as the browser that opens it. Gmail on Android
   * opens links in its own WebView, which keeps its storage separate from
   * Chrome and from the installed PWA - so the link signs you into a throwaway
   * browser and the app you actually use stays signed out. There is no fix for
   * that from inside our code; it is the mail client's decision. The built-in
   * Supabase mailer also caps at roughly two messages an hour, which is below
   * what a team of five signing in on pitch day needs.
   *
   * Passwords take the mail client out of the loop entirely. The cost is a
   * password to remember; the benefit is that sign-in works the same way in
   * every browser, offline-tolerant, with no rate limit and no round trip.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      // Supabase returns this for a wrong password AND for an email that has
      // no password set (e.g. an account created by the old magic-link flow).
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'Wrong email or password.'
          : error.message,
      )
    }
  }, [])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      details: { fullName: string; phone: string; role: 'planter' | 'sponsor' },
    ) => {
      if (DEMO) {
        setProfile((p) =>
          p
            ? {
                ...p,
                full_name: details.fullName,
                phone: details.phone || null,
                role: details.role,
              }
            : p,
        )
        return
      }

      signingUp.current = true
      let createdUid: string | null = null
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw new Error(error.message)

        // With "Confirm email" switched off in Supabase, signUp returns a
        // live session and the user is straight in. If that setting is ever
        // turned back on, session is null and the user is left staring at a
        // form that looks like it did nothing - so say what happened instead.
        if (!data.session) {
          throw new Error(
            'Account created, but email confirmation is switched on in Supabase. ' +
              'Turn it off under Authentication → Sign In / Providers → Email.',
          )
        }

        // The 0004 trigger creates the profile row in the same transaction
        // as the auth user, so this normally takes the update path; upsert
        // also covers the insert path if the trigger is ever removed. Uses
        // data.session.user.id directly - the userId in React state has not
        // re-rendered yet at this point.
        const uid = data.session.user.id
        createdUid = uid
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .upsert({
            id: uid,
            full_name: details.fullName.trim(),
            phone: details.phone.trim() || null,
          })
          .select('*')
          .maybeSingle()
        if (profErr) throw new Error(profErr.message)
        if (prof) setProfile(prof as Profile)

        // Role goes through the SECURITY DEFINER doorway, same as setRole.
        const { data: withRole, error: roleErr } = await supabase.rpc(
          'set_my_role',
          { p_role: details.role },
        )
        if (roleErr) throw new Error(roleErr.message)
        if (withRole) setProfile(withRole as unknown as Profile)
      } catch (e) {
        // If the account exists but a later write failed, the user IS signed
        // in - the userId effect was skipped, so load whatever profile the
        // trigger created rather than leaving the app with none.
        if (createdUid) void loadProfile(createdUid)
        throw e
      } finally {
        signingUp.current = false
      }
    },
    [loadProfile],
  )

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
      signUp,
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
      signUp,
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
