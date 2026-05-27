import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Using the user's custom Supabase instance
const SUPABASE_URL = 'https://typikdvgikkmigmmaeyh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_cU-aKlO3VAHLDvNlYhjStw_QuOu-0tw'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The "setAll" method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  )
}
