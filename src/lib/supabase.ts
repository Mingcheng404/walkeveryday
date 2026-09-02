import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const rawSupabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

const normalizedSupabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const normalizedSupabaseAnonKey = normalizeSupabaseKey(rawSupabaseAnonKey)
const validSupabaseUrl = isValidHttpUrl(normalizedSupabaseUrl)
const validSupabaseKey = normalizedSupabaseAnonKey.length > 0

export const isSupabaseConfigured = validSupabaseUrl && validSupabaseKey

export const supabase = createClient<Database>(
  validSupabaseUrl ? normalizedSupabaseUrl : 'https://placeholder.supabase.co',
  validSupabaseKey ? normalizedSupabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

function normalizeToken(value: string): string {
  return value.trim().replace(/\r/g, '').replace(/^['"]|['"]$/g, '')
}

function normalizeSupabaseUrl(value: string): string {
  const sanitized = normalizeToken(value).replace(/^(VITE_SUPABASE_URL|SUPABASE_URL)\s*=\s*/i, '')
  if (!sanitized) {
    return ''
  }

  if (isValidHttpUrl(sanitized)) {
    return sanitized
  }

  // Support common secret mistakes:
  // 1) Project ref only: "abcd1234"
  // 2) Domain without protocol: "abcd1234.supabase.co"
  if (/^[a-z0-9-]+$/i.test(sanitized)) {
    return `https://${sanitized}.supabase.co`
  }
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(sanitized)) {
    return `https://${sanitized}`
  }

  return sanitized
}

function normalizeSupabaseKey(value: string): string {
  const sanitized = normalizeToken(value).replace(
    /^(VITE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY)\s*=\s*/i,
    '',
  )
  return normalizeToken(sanitized)
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

        uses: actions/deploy-pages@v4
