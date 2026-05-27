import { createBrowserClient } from '@supabase/ssr'

// Using the user's custom Supabase instance
const SUPABASE_URL = 'https://typikdvgikkmigmmaeyh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_cU-aKlO3VAHLDvNlYhjStw_QuOu-0tw'

export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  )
}
