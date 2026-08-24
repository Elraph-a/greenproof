import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at boot rather than with an opaque network error at T0, standing
// in a field with 40 trees to register.
if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy app/.env.example to app/.env.local, fill it in, and restart the dev server.',
  )
}

/**
 * The anon key ships inside the browser and is public. That is fine and
 * expected - what stops a user forging a verification result is the
 * column-level GRANTs in supabase/migrations/0002_rls_grants.sql, which never
 * give a client write access to confidence / verdict / signals / embeddings.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
